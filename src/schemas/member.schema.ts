import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type MemberDocument = Member & Document;

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Member {
  _id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  phone: string;

  @Prop({ default: Date.now })
  joinDate: Date;

  @Prop({ enum: ['active', 'left'], default: 'active' })
  status: string;

  @Prop({ enum: ['paid', 'pending', 'overdue'], default: 'pending' })
  feeStatus: string;

  @Prop()
  lastPayment?: Date;

  @Prop({ type: [{ month: String, amount: Number, dueDate: Date, status: String, paidDate: Date }], default: [] })
  feeHistory?: Array<{ month: string; amount: number; dueDate?: Date; status?: string; paidDate?: Date }>;

  @Prop({ type: Types.ObjectId, ref: 'Gym', required: false })
  gymId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  userId?: Types.ObjectId;

  @Prop({ enum: ['male', 'female'], required: false })
  gender?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const MemberSchema = SchemaFactory.createForClass(Member);
