import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { Member, MemberSchema } from './schemas/member.schema';
import { Fee, FeeSchema } from './schemas/fee.schema';
import { Expense, ExpenseSchema } from './schemas/expense.schema';
import { Gym, GymSchema } from './schemas/gym.schema';
import { User, UserSchema } from './schemas/user.schema';
import { Settings, SettingsSchema } from './settings/settings.schema';
import { AuthModule } from './auth/auth.module';
import { MembersModule } from './members/members.module';
import { SettingsModule } from './settings/settings.module';
import { FeesModule } from './fees/fees.module';
import { ExpensesModule } from './expenses/expenses.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRoot(process.env.MONGO_URI || 'mongodb://localhost:27017/gymdb'),
    MongooseModule.forFeature([
      { name: Member.name, schema: MemberSchema },
      { name: Fee.name, schema: FeeSchema },
      { name: Expense.name, schema: ExpenseSchema },
      { name: Gym.name, schema: GymSchema },
      { name: User.name, schema: UserSchema },
      { name: Settings.name, schema: SettingsSchema },
    ]),
    AuthModule,
    // Members module provides full CRUD for Member documents
    MembersModule,
    SettingsModule,
    ExpensesModule,
    FeesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
