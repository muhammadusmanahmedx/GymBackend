import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ExpenseDocument = Expense & Document;

@Schema({ timestamps: { createdAt: 'createdAt' } })
export class Expense {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Gym', required: true })
  gymId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: false })
  userId?: Types.ObjectId;

  @Prop({ required: true })
  description: string;

  @Prop({ required: true })
  amount: number;

  @Prop({ enum: ['equipment', 'utilities', 'rent', 'salary', 'maintenance', 'other'], required: true })
  category: string;

  @Prop({ required: true })
  date: Date;

  createdAt: Date;
}

export const ExpenseSchema = SchemaFactory.createForClass(Expense);
