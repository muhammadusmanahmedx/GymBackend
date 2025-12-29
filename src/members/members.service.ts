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

    // prefer settings.monthlyFee if present (global per-user settings), otherwise gym.monthlyFee
    try {
      const anySettings = await this.settingsModel.findOne().lean().exec();
      if (anySettings && typeof anySettings.monthlyFee === 'number' && anySettings.monthlyFee > 0) {
        amount = anySettings.monthlyFee;
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
    return this.memberModel.find(filter).lean().exec();
  }

  async findOne(id: string) {
    const found = await this.memberModel.findById(id).lean().exec();
    if (!found) throw new NotFoundException('Member not found');
    return found;
  }

  async update(id: string, dto: UpdateMemberDto) {
    const updated = await this.memberModel.findByIdAndUpdate(id, dto, { new: true }).lean().exec();
    if (!updated) throw new NotFoundException('Member not found');
    return updated;
  }

  async remove(id: string) {
    const res = await this.memberModel.findByIdAndDelete(id).lean().exec();
    if (!res) throw new NotFoundException('Member not found');
    return { success: true };
  }
}
