import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, Schema as MongooseSchema } from 'mongoose';

export type MemberDocument = Member & Document;

// Define feeHistory subdocument schema with _id disabled (we set it manually from Fee doc)
const FeeHistorySchema = new MongooseSchema({
  _id: { type: MongooseSchema.Types.ObjectId, required: false },
  month: { type: String, required: true },
  amount: { type: Number, required: true },
  dueDate: { type: Date },
  status: { type: String, enum: ['paid', 'pending', 'overdue'], default: 'pending' },
  paidDate: { type: Date },
}, { _id: false }); // disable auto _id for subdocs

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

  @Prop({ type: [FeeHistorySchema], default: [] })
  feeHistory?: Array<{ _id?: Types.ObjectId; month: string; amount: number; dueDate?: Date; status?: string; paidDate?: Date }>;

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
