import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } })
export class User {
  _id: Types.ObjectId;

  @Prop({ required: false, unique: true })
  username?: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true })
  password: string; // hashed

  @Prop({ type: Types.ObjectId, ref: 'Gym', required: false })
  gymId?: Types.ObjectId;

  @Prop({ required: false })
  gymName?: string;

  @Prop({ required: false })
  gymLocation?: string;

  @Prop({ type: String, enum: ['owner', 'staff'], default: 'owner' })
  role: 'owner' | 'staff';

  @Prop({ type: Boolean, default: true })
  authorized: boolean;

  createdAt: Date;
  updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
