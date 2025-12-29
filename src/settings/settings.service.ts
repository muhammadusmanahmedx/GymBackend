import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Settings, SettingsDocument } from './settings.schema';
import { CreateSettingsDto } from './dto/create-settings.dto';
import { User, UserDocument } from '../schemas/user.schema';
import { Gym, GymDocument } from '../schemas/gym.schema';
import { Fee, FeeDocument } from '../schemas/fee.schema';
import { Member, MemberDocument } from '../schemas/member.schema';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Gym.name) private gymModel: Model<GymDocument>,
    @InjectModel(Fee.name) private feeModel: Model<FeeDocument>,
    @InjectModel(Member.name) private memberModel: Model<MemberDocument>,
  ) {}

  async upsert(dto: CreateSettingsDto) {
    const filter = { userId: new Types.ObjectId(dto.userId) };
    const update: any = {};
    if (dto.monthlyFee !== undefined) update.monthlyFee = dto.monthlyFee;

    const opts = { new: true, upsert: true, setDefaultsOnInsert: true } as const;
    const settingsRes = await this.settingsModel.findOneAndUpdate(filter, { $set: update }, opts).lean().exec();

    let updatedUser = null;
    if (dto.gymName !== undefined) {
      updatedUser = await this.userModel.findByIdAndUpdate(dto.userId, { gymName: dto.gymName }, { new: true }).lean().exec();
    }

    // If monthlyFee was provided, propagate to pending fees and member feeHistory
    if (dto.monthlyFee !== undefined) {
      try {
        // find gyms owned by this user
        const gyms = await this.gymModel.find({ ownerId: new Types.ObjectId(dto.userId) }).lean().exec();
        const gymIds = gyms && gyms.length ? gyms.map((g: any) => g._id) : [];

        if (gymIds.length) {
          // update pending/unpaid fees for these gyms
          await this.feeModel.updateMany({ gymId: { $in: gymIds }, status: { $ne: 'paid' } }, { $set: { amount: dto.monthlyFee } }).exec();

          // update member feeHistory entries (array) where status != 'paid'
          try {
            await this.memberModel.updateMany(
              { gymId: { $in: gymIds }, 'feeHistory.status': { $ne: 'paid' } },
              { $set: { 'feeHistory.$[elem].amount': dto.monthlyFee } },
              { arrayFilters: [{ 'elem.status': { $ne: 'paid' } }] }
            ).exec();
          } catch (e) {
            // some mongoose drivers may not support arrayFilters in certain versions; fallback: update members individually
            try {
              const members = await this.memberModel.find({ gymId: { $in: gymIds } }).lean().exec();
              for (const m of members) {
                if (Array.isArray((m as any).feeHistory)) {
                  const fh = (m as any).feeHistory;
                  let changed = false;
                  const newFh = fh.map((entry: any) => {
                    if (entry && entry.status !== 'paid') {
                      changed = true;
                      return { ...entry, amount: dto.monthlyFee };
                    }
                    return entry;
                  });
                  if (changed) {
                    await this.memberModel.findByIdAndUpdate(m._id, { $set: { feeHistory: newFh } }).exec();
                  }
                }
              }
            } catch (e2) {
              // ignore
            }
          }
        }
      } catch (e) {
        // ignore propagation errors
      }
    }

    return { settings: settingsRes, user: updatedUser };
  }

  async findByUserId(userId: string) {
    const found = await this.settingsModel.findOne({ userId: new Types.ObjectId(userId) }).lean().exec();
    if (!found) return null;
    return found;
  }

  async removeByUserId(userId: string) {
    const res = await this.settingsModel.findOneAndDelete({ userId: new Types.ObjectId(userId) }).lean().exec();
    if (!res) throw new NotFoundException('Settings not found');
    return { success: true };
  }
}
