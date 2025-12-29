import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type GymDocument = Gym & Document;

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class Gym {
  _id: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop({ required: false })
  location?: string;

  @Prop({ required: true, default: 3000 })
  monthlyFee: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  ownerId: Types.ObjectId;

  @Prop({ enum: ['active', 'blocked'], default: 'active' })
  subscriptionStatus: string;

  createdAt: Date;
  updatedAt: Date;
}

export const GymSchema = SchemaFactory.createForClass(Gym);
