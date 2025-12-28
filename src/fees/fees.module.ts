import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Fee, FeeSchema } from '../schemas/fee.schema';
import { Member, MemberSchema } from '../schemas/member.schema';
import { Gym, GymSchema } from '../schemas/gym.schema';
import { FeesService } from './fees.service';
import { FeesController } from './fees.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Fee.name, schema: FeeSchema }, { name: Member.name, schema: MemberSchema }, { name: Gym.name, schema: GymSchema }])],
  providers: [FeesService],
  controllers: [FeesController],
  exports: [FeesService],
})
export class FeesModule {}
