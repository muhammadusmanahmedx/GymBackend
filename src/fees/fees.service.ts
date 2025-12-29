import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Fee, FeeDocument } from '../schemas/fee.schema';
import { CreateFeeDto } from './dto/create-fee.dto';
import { UpdateFeeDto } from './dto/update-fee.dto';
import { Member, MemberDocument } from '../schemas/member.schema';
import { Gym, GymDocument } from '../schemas/gym.schema';
import { Settings, SettingsDocument } from '../settings/settings.schema';

@Injectable()
export class FeesService {
  constructor(
    @InjectModel(Fee.name) private feeModel: Model<FeeDocument>,
    @InjectModel(Member.name) private memberModel: Model<MemberDocument>,
    @InjectModel(Gym.name) private gymModel: Model<GymDocument>,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
  ) {}

  async create(dto: CreateFeeDto) {
    const createdDoc = await this.feeModel.create({
      memberId: new Types.ObjectId(dto.memberId),
      gymId: new Types.ObjectId(dto.gymId),
      amount: dto.amount,
      month: dto.month,
      dueDate: new Date(dto.dueDate),
      status: dto.status || 'pending',
      paidDate: dto.paidDate ? new Date(dto.paidDate) : undefined,
    });
    const created = createdDoc.toObject();

    // push into member.feeHistory if member exists (include fee _id)
    try {
      const feeEntry = {
        _id: created._id,
        month: created.month,
        amount: created.amount,
        dueDate: created.dueDate,
        status: created.status,
        paidDate: created.paidDate || undefined,
      };
      await this.memberModel.findByIdAndUpdate(created.memberId, { $push: { feeHistory: feeEntry } }).exec();
    } catch (e) {
      // ignore errors syncing member feeHistory
    }

    return created;
  }

  async findAll(memberId?: string, gymId?: string) {
    const filter: any = {};
    if (memberId) filter.memberId = new Types.ObjectId(memberId);
    if (gymId) filter.gymId = new Types.ObjectId(gymId);
    const fees = await this.feeModel.find(filter).lean().exec();

    // If queried by memberId and no fees exist, create initial fee for member
    if (memberId && (!fees || fees.length === 0)) {
      try {
        const member = await this.memberModel.findById(memberId).lean().exec();
        if (member) {
          // determine gym monthly fee
          let amount = 0;
          if (member.gymId) {
            try {
              const gym = await this.gymModel.findById(member.gymId).lean().exec();
              if (gym && typeof gym.monthlyFee === 'number') amount = gym.monthlyFee;
            } catch (e) {
              // ignore
            }
          }

          // use current date for initial fee due date and month
          const now = new Date();
          const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const dueDate = now;

          // create fee if not exists
          const exists = await this.feeModel.findOne({ memberId: member._id, month: monthStr }).lean().exec();
            if (!exists) {
            // determine gym monthly fee, prefer per-user settings if present
            let amount = 0;
            if (member.gymId) {
              try {
                const gym = await this.gymModel.findById(member.gymId).lean().exec();
                if (gym) {
                  // try settings for gym owner
                  try {
                    const settings = await this.settingsModel.findOne({ userId: gym.ownerId }).lean().exec();
                    if (settings && typeof settings.monthlyFee === 'number' && settings.monthlyFee > 0) {
                      amount = settings.monthlyFee;
                    }
                  } catch (e) {
                    // ignore
                  }
                  if (!amount && typeof gym.monthlyFee === 'number') amount = gym.monthlyFee;
                }
              } catch (e) {
                // ignore
              }
            }
            const created = await this.feeModel.create({ memberId: member._id, gymId: member.gymId, amount, month: monthStr, dueDate, status: member.feeStatus || 'pending' });
            // also push to member.feeHistory with same _id
            try {
              await this.memberModel.findByIdAndUpdate(member._id, {
                $push: {
                  feeHistory: {
                    _id: created._id,
                    month: monthStr,
                    amount,
                    dueDate,
                    status: member.feeStatus || 'pending',
                  },
                },
              }).exec();
            } catch (e) {
              // ignore
            }
          }
        }
      } catch (e) {
        // ignore creation errors
      }

      // re-query and return
      return this.feeModel.find({ memberId: new Types.ObjectId(memberId) }).lean().exec();
    }

    return fees;
  }

  async findOne(id: string) {
    const found = await this.feeModel.findById(id).lean().exec();
    if (!found) throw new NotFoundException('Fee not found');
    return found;
  }

  async update(id: string, dto: UpdateFeeDto) {
    // Attempt to find Fee doc by id
    let feeDoc = await this.feeModel.findById(id).lean().exec();
    let paidDate = dto.paidDate ? new Date(dto.paidDate as any) : new Date();

    // If not found, try to resolve as member.feeHistory subdoc id and update member subdoc directly
    if (!feeDoc) {
      try {
        const memberWithSub = await this.memberModel.findOne({ 'feeHistory._id': new Types.ObjectId(id) }).lean().exec();
        if (memberWithSub) {
          const fh = (memberWithSub as any).feeHistory.find((x: any) => String(x._id) === String(id));
          if (fh) {
            // update member subdoc status and paidDate
            try {
              await this.memberModel.updateOne(
                { _id: memberWithSub._id, 'feeHistory._id': new Types.ObjectId(id) },
                { $set: { 'feeHistory.$.status': 'paid', 'feeHistory.$.paidDate': paidDate } }
              ).exec();
              // also update member summary fields
              try {
                await this.memberModel.findByIdAndUpdate(memberWithSub._id, { feeStatus: 'paid', lastPayment: paidDate }, { new: true }).exec();
              } catch (e) {
                // ignore
              }
            } catch (e) {
              // ignore
            }

            // find or create corresponding Fee document for this member+month
            feeDoc = await this.feeModel.findOne({ memberId: memberWithSub._id, month: fh.month }).lean().exec();
            if (!feeDoc) {
              const created = await this.feeModel.create({ memberId: memberWithSub._id, gymId: memberWithSub.gymId, amount: fh.amount || 0, month: fh.month, dueDate: fh.dueDate || new Date(), status: 'paid', paidDate });
              feeDoc = created.toObject();
              // ensure member.feeHistory contains this fee _id (if previous subdoc didn't have it)
              try {
                await this.memberModel.updateOne({ _id: memberWithSub._id, 'feeHistory._id': new Types.ObjectId(id) }, { $set: { 'feeHistory.$._id': created._id } }).exec();
              } catch (e) {
                // ignore
              }
            } else {
              // update existing fee doc to paid
              await this.feeModel.findByIdAndUpdate(feeDoc._id, { status: 'paid', paidDate }, { new: true }).lean().exec();
            }

            // create next month's fee if member is active
            try {
              if (memberWithSub.status === 'active') {
                const day = paidDate.getUTCDate();
                const next = new Date(Date.UTC(paidDate.getUTCFullYear(), paidDate.getUTCMonth() + 1, day));
                const monthStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
                const exists = await this.feeModel.findOne({ memberId: memberWithSub._id, month: monthStr }).lean().exec();
                if (!exists) {
                  const newFee = await this.feeModel.create({ memberId: memberWithSub._id, gymId: memberWithSub.gymId, amount: fh.amount || 0, month: monthStr, dueDate: next, status: 'pending' });
                  try {
                    await this.memberModel.findByIdAndUpdate(memberWithSub._id, { $push: { feeHistory: { _id: newFee._id, month: monthStr, amount: fh.amount || 0, dueDate: next, status: 'pending' } } }).exec();
                  } catch (e) {
                    // ignore
                  }
                }
              }
            } catch (e) {
              // ignore
            }
            return feeDoc;
          }
        }
      } catch (e) {
        // ignore lookup errors
      }
      throw new NotFoundException('Fee not found');
    }

    // At this point we have feeDoc (found by id)
    const updated = await this.feeModel.findByIdAndUpdate(feeDoc._id, {
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate as any) : undefined,
      paidDate: dto.paidDate ? new Date(dto.paidDate as any) : undefined,
    }, { new: true }).lean().exec();

    // if marked paid now, create next month's fee for member if active
    if (dto.status === 'paid') {
      try {
        const member = await this.memberModel.findById(feeDoc.memberId).lean().exec();
        if (member && member.status === 'active') {
          const paid = dto.paidDate ? new Date(dto.paidDate as any) : (feeDoc.paidDate ? new Date(feeDoc.paidDate) : new Date());
          const day = paid.getUTCDate();
          const next = new Date(Date.UTC(paid.getUTCFullYear(), paid.getUTCMonth() + 1, day));
          const monthStr = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
          const exists = await this.feeModel.findOne({ memberId: feeDoc.memberId, month: monthStr }).lean().exec();
          if (!exists) {
            const newFee = await this.feeModel.create({ memberId: feeDoc.memberId, gymId: feeDoc.gymId, amount: feeDoc.amount, month: monthStr, dueDate: next, status: 'pending' });
            try {
              await this.memberModel.findByIdAndUpdate(feeDoc.memberId, { $push: { feeHistory: { _id: newFee._id, month: monthStr, amount: feeDoc.amount, dueDate: next, status: 'pending' } } }).exec();
            } catch (e) {
              // ignore
            }
          }
        }
      } catch (e) {
        // ignore errors creating next fee
      }
      // mark the existing fee as paid in member.feeHistory (if present) or push an entry
      try {
        const paid = dto.paidDate ? new Date(dto.paidDate as any) : (feeDoc.paidDate ? new Date(feeDoc.paidDate) : new Date());
        const res = await this.memberModel.updateOne(
          { _id: feeDoc.memberId, 'feeHistory.month': feeDoc.month },
          { $set: { 'feeHistory.$.status': 'paid', 'feeHistory.$.paidDate': paid } }
        ).exec();
        if ((res as any)?.modifiedCount === 0) {
          await this.memberModel.findByIdAndUpdate(feeDoc.memberId, {
            $push: {
              feeHistory: {
                _id: feeDoc._id,
                month: feeDoc.month,
                amount: feeDoc.amount,
                dueDate: feeDoc.dueDate,
                status: 'paid',
                paidDate: paid,
              },
            },
          }).exec();
        }

        // update member summary fields
        try {
          await this.memberModel.findByIdAndUpdate(feeDoc.memberId, { feeStatus: 'paid', lastPayment: paid }, { new: true }).exec();
        } catch (e) {
          // ignore
        }
      } catch (e) {
        // ignore
      }

    }

    return updated;
  }

  async remove(id: string) {
    const res = await this.feeModel.findByIdAndDelete(id).lean().exec();
    if (!res) throw new NotFoundException('Fee not found');
    return { success: true };
  }
}
