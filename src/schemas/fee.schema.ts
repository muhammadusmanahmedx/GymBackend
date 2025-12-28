import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FeeDocument = Fee & Document;

@Schema({ timestamps: { createdAt: 'createdAt' } })
export class Fee {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Member', required: true })
  memberId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Gym', required: true })
  gymId: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true })
  month: string; // e.g. "2024-12"

  @Prop({ required: true })
  dueDate: Date;

  @Prop({ enum: ['paid', 'pending', 'overdue'], default: 'pending' })
  status: string;

  @Prop()
  paidDate?: Date;

  createdAt: Date;
}

export const FeeSchema = SchemaFactory.createForClass(Fee);
