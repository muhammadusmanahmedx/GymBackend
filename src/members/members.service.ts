import { Injectable, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MemberDocument, Member } from '../schemas/member.schema';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { Fee, FeeDocument } from '../schemas/fee.schema';
import { Gym, GymDocument } from '../schemas/gym.schema';
import { Settings, SettingsDocument } from '../settings/settings.schema';

@Injectable()
export class MembersService {
  constructor(
    @InjectModel(Member.name) private memberModel: Model<MemberDocument>,
    @InjectModel(Fee.name) private feeModel: Model<FeeDocument>,
    @InjectModel(Gym.name) private gymModel: Model<GymDocument>,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
    @InjectModel('User') private userModel: Model<any>,
  ) {}

  async create(dto: CreateMemberDto, authHeader?: string) {
    // determine gymId and monthly amount before creating member so we can include feeHistory atomically
    let gymIdStr = dto.gymId || undefined;
    // if authHeader provided, try to decode token to get user and their gymId
    if (authHeader && !gymIdStr) {
      try {
        const token = authHeader.replace(/^Bearer\s+/i, '');
        const jwt = require('jsonwebtoken');
        const secret = process.env.JWT_SECRET || 'change-me';
        const decoded: any = jwt.verify(token, secret);
        const userId = decoded?.sub;
        if (userId) {
          const user = (await this.userModel.findById(userId).lean().exec()) as any;
          if (user) {
            if (user.gymId) gymIdStr = String(user.gymId);
            // attach userId to dto so member is linked
            (dto as any).userId = userId;
          }
        }
      } catch (e) {
        // ignore token errors
      }
    }
    let amount = 0;

    // prefer settings.monthlyFee in this order:
    // 1) settings for the gym owner (if gymId resolved),
    // 2) settings for the authenticated user (if available),
    // 3) gym.monthlyFee
    try {
      let anySettings: any = null;
      const uid = (dto as any).userId;

      // if we have a gymId, try to read gym and its owner settings first
      if (gymIdStr) {
        try {
          const gymForSettings = await this.gymModel.findById(gymIdStr).lean().exec();
          if (gymForSettings && gymForSettings.ownerId) {
            try {
              anySettings = await this.settingsModel.findOne({ userId: new Types.ObjectId(gymForSettings.ownerId) }).lean().exec();
            } catch (e) {
              anySettings = null;
            }
            if (anySettings && typeof anySettings.monthlyFee === 'number' && anySettings.monthlyFee > 0) {
              amount = anySettings.monthlyFee;
            }
          }
        } catch (e) {
          // ignore
        }
      }

      // if not found via gym owner, fall back to settings for current user
      if (!amount && uid) {
        try {
          anySettings = await this.settingsModel.findOne({ userId: new Types.ObjectId(uid) }).lean().exec();
        } catch (e) {
          anySettings = null;
        }
        if (anySettings && typeof anySettings.monthlyFee === 'number' && anySettings.monthlyFee > 0) {
          amount = anySettings.monthlyFee;
        }
      }
    } catch (e) {
      // ignore
    }

    if (!amount) {
      if (gymIdStr) {
        try {
          const gym = await this.gymModel.findById(gymIdStr).lean().exec();
          if (gym && typeof gym.monthlyFee === 'number') amount = gym.monthlyFee;
        } catch (e) {
          // ignore
        }
      }
      // fallback to first gym if still not found
      if (!amount) {
        try {
          const anyGym = await this.gymModel.findOne().lean().exec();
          if (anyGym && typeof anyGym.monthlyFee === 'number') {
            amount = anyGym.monthlyFee;
            if (!gymIdStr) gymIdStr = String(anyGym._id);
          }
        } catch (e) {
          // ignore
        }
      }
    }

    // prepare initial fee entry (due today)
    const now = new Date();
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dueDate = now;
    const initialFeeEntry = {
      month: monthStr,
      amount,
      dueDate,
      status: dto.feeStatus || 'pending',
    };

    // create member (feeHistory will be added after fee doc creation to keep ids in sync)
    const gymObjectId = gymIdStr ? new Types.ObjectId(gymIdStr) : undefined;
    let created: any;
    try {
      created = await this.memberModel.create({
        ...dto,
        gymId: gymObjectId,
      });
    } catch (e) {
      console.error('MembersService.create - error creating member', e);
      // Mongo duplicate key
      if ((e as any)?.code === 11000) {
        throw new BadRequestException('Member with the same unique field already exists');
      }
      throw new InternalServerErrorException('Failed to create member');
    }

    // create an actual fee document referencing the member, then push feeHistory entry
    let feeDoc = null as any;
    try {
      feeDoc = await this.feeModel.create({ memberId: created._id, gymId: gymObjectId || created.gymId || undefined, amount, month: monthStr, dueDate, status: dto.feeStatus || 'pending' });
    } catch (e) {
      // fee creation failed (e.g., missing gymId); we'll still add a feeHistory entry without a Fee _id
    }

    try {
      if (feeDoc) {
        const feeEntry = {
          _id: feeDoc._id,
          month: monthStr,
          amount,
          dueDate,
          status: dto.feeStatus || 'pending',
        };
        await this.memberModel.findByIdAndUpdate(created._id, { $push: { feeHistory: feeEntry } }).exec();
      } else {
        const feeEntry = {
          month: monthStr,
          amount,
          dueDate,
          status: dto.feeStatus || 'pending',
        };
        await this.memberModel.findByIdAndUpdate(created._id, { $push: { feeHistory: feeEntry } }).exec();
      }
    } catch (e) {
      // ignore member feeHistory update errors
    }
    // return the freshly fetched member so callers see the pushed feeHistory
    try {
      const fresh = await this.memberModel.findById(created._id).lean().exec();
      if (fresh) return fresh;
    } catch (e) {
      // fall back to created object
    }

    return created.toObject();
  }

  async findAll(gymId?: string) {
    const filter: any = {};
    if (gymId) filter.gymId = new Types.ObjectId(gymId);
    const members = await this.memberModel.find(filter).lean().exec();
    
    // Check and update feeStatus for members based on due dates
    await this.checkAndUpdateFeeStatuses(members);
    
    // Return fresh data after potential updates
    return this.memberModel.find(filter).lean().exec();
  }

  // Helper to check if any pending fees have reached their due date and update feeStatus
  private async checkAndUpdateFeeStatuses(members: any[]) {
    const now = new Date();
    
    for (const member of members) {
      if (member.status !== 'active') continue;
      if (member.feeStatus === 'pending') continue; // Already pending, no need to update
      
      const feeHistory = member.feeHistory || [];
      
      // Find any pending fee whose dueDate has arrived or passed
      const hasDuePendingFee = feeHistory.some((fh: any) => {
        if (fh.status !== 'pending') return false;
        const dueDate = new Date(fh.dueDate);
        return dueDate <= now;
      });
      
      if (hasDuePendingFee && member.feeStatus !== 'pending') {
        // Update member's feeStatus to pending
        try {
          await this.memberModel.findByIdAndUpdate(member._id, { feeStatus: 'pending' }).exec();
        } catch (e) {
          // Ignore update errors
        }
      }
    }
  }

  async findOne(id: string) {
    let found = await this.memberModel.findById(id).lean().exec();
    if (!found) throw new NotFoundException('Member not found');
    
    // Check and update feeStatus if needed
    await this.checkAndUpdateFeeStatuses([found]);
    
    // Return fresh data after potential update
    return this.memberModel.findById(id).lean().exec();
  }

  async update(id: string, dto: UpdateMemberDto) {
    // fetch current member to detect status changes
    const existing = await this.memberModel.findById(id).lean().exec();
    if (!existing) throw new NotFoundException('Member not found');

    const prevStatus = existing.status;

    const updated = await this.memberModel.findByIdAndUpdate(id, dto, { new: true }).lean().exec();
    if (!updated) throw new NotFoundException('Member not found');

    // If member was reactivated (left -> active), ensure current month's fee exists
    try {
      const newStatus = (dto as any).status;
      if (prevStatus === 'left' && newStatus === 'active') {
        // do not add fees for members that remain left
        // check if feeHistory already contains an entry for current month
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const memberRec: any = await this.memberModel.findById(id).lean().exec();
        const fh: any[] = Array.isArray(memberRec?.feeHistory) ? memberRec.feeHistory : [];
        const exists = fh.find((e) => String(e.month) === String(monthStr));
        if (!exists) {
          // determine amount using same logic as create()
          let amount = 0;
          try {
            // try gym owner settings first
            if (memberRec?.gymId) {
              try {
                const gym = await this.gymModel.findById(memberRec.gymId).lean().exec();
                if (gym && gym.ownerId) {
                  try {
                    const s = await this.settingsModel.findOne({ userId: new Types.ObjectId(gym.ownerId) }).lean().exec();
                    if (s && typeof s.monthlyFee === 'number' && s.monthlyFee > 0) amount = s.monthlyFee;
                  } catch (e) {
                    // ignore
                  }
                }
                if (gym && !amount && typeof gym.monthlyFee === 'number') amount = gym.monthlyFee;
              } catch (e) {
                // ignore
              }
            }
            // fallback to settings for member.userId
            if (!amount && memberRec?.userId) {
              try {
                const s2 = await this.settingsModel.findOne({ userId: new Types.ObjectId(memberRec.userId) }).lean().exec();
                if (s2 && typeof s2.monthlyFee === 'number' && s2.monthlyFee > 0) amount = s2.monthlyFee;
              } catch (e) {
                // ignore
              }
            }
          } catch (e) {
            // ignore
          }
          if (!amount) {
            try {
              const gym = memberRec?.gymId ? await this.gymModel.findById(memberRec.gymId).lean().exec() : null;
              if (gym && typeof gym.monthlyFee === 'number') amount = gym.monthlyFee;
            } catch (e) {
              // ignore
            }
          }

          // create fee document if possible
          try {
            const dueDate = now;
            const createdFee = await this.feeModel.create({ memberId: new Types.ObjectId(id), gymId: memberRec?.gymId || undefined, amount, month: monthStr, dueDate, status: 'pending' });
            // push into member.feeHistory with the fee _id
            try {
              await this.memberModel.findByIdAndUpdate(id, { $push: { feeHistory: { _id: createdFee._id, month: monthStr, amount, dueDate, status: 'pending' } }, $set: { feeStatus: 'pending' } }).exec();
            } catch (e) {
              // fallback: push without _id
              try {
                await this.memberModel.findByIdAndUpdate(id, { $push: { feeHistory: { month: monthStr, amount, dueDate, status: 'pending' } }, $set: { feeStatus: 'pending' } }).exec();
              } catch (e2) { /* ignore */ }
            }
          } catch (e) {
            // if fee creation fails, still push feeHistory without _id
            try {
              await this.memberModel.findByIdAndUpdate(id, { $push: { feeHistory: { month: monthStr, amount, dueDate: now, status: 'pending' } }, $set: { feeStatus: 'pending' } }).exec();
            } catch (e2) { /* ignore */ }
          }
        }
      }
    } catch (e) {
      // ignore reactivation side-effect errors
    }

    return updated;
  }

  async remove(id: string) {
    const res = await this.memberModel.findByIdAndDelete(id).lean().exec();
    if (!res) throw new NotFoundException('Member not found');
    return { success: true };
  }
}
