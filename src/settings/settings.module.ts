import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Settings, SettingsSchema } from './settings.schema';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { User, UserSchema } from '../schemas/user.schema';
import { Gym, GymSchema } from '../schemas/gym.schema';
import { Fee, FeeSchema } from '../schemas/fee.schema';
import { Member, MemberSchema } from '../schemas/member.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Settings.name, schema: SettingsSchema },
      { name: User.name, schema: UserSchema },
      { name: Gym.name, schema: GymSchema },
      { name: Fee.name, schema: FeeSchema },
      { name: Member.name, schema: MemberSchema },
    ]),
  ],
  providers: [SettingsService],
  controllers: [SettingsController],
  exports: [SettingsService],
})
export class SettingsModule {}
