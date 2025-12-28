import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MembersService } from './members.service';
import { MembersController } from './members.controller';
import { Member, MemberSchema } from '../schemas/member.schema';
import { Fee, FeeSchema } from '../schemas/fee.schema';
import { Gym, GymSchema } from '../schemas/gym.schema';
import { Settings, SettingsSchema } from '../settings/settings.schema';
import { User, UserSchema } from '../schemas/user.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Member.name, schema: MemberSchema },
    { name: Fee.name, schema: FeeSchema },
    { name: Gym.name, schema: GymSchema },
    { name: Settings.name, schema: SettingsSchema },
    { name: User.name, schema: UserSchema },
  ])],
  providers: [MembersService],
  controllers: [MembersController],
  exports: [MembersService],
})
export class MembersModule {}
