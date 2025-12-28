import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Settings, SettingsDocument } from './settings.schema';
import { CreateSettingsDto } from './dto/create-settings.dto';
import { User, UserDocument } from '../schemas/user.schema';

@Injectable()
export class SettingsService {
  constructor(
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
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
