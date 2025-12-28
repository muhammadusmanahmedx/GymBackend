import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { UserDocument, User } from '../schemas/user.schema';
import { Gym, GymDocument } from '../schemas/gym.schema';
import { Settings, SettingsDocument } from '../settings/settings.schema';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Gym.name) private gymModel: Model<GymDocument>,
    @InjectModel(Settings.name) private settingsModel: Model<SettingsDocument>,
  ) {}

  async signup(dto: CreateUserDto) {
    const existing = await this.userModel.findOne({ email: dto.email }).exec();
    if (existing) throw new ConflictException('Email already registered');

    const hashed = await bcrypt.hash(dto.password, 10);
    // Log incoming DTO for debugging
    console.log('AuthService.signup dto:', { name: dto.name, email: dto.email, gymName: dto.gymName, role: dto.role });

    try {
      // Create user first
      const created = await this.userModel.create({
        name: dto.name,
        email: dto.email,
        password: hashed,
        username: dto.email,
        gymName: dto.gymName,
        gymLocation: dto.gymLocation,
        role: dto.role || 'owner',
        authorized: true,
      });

      // Create a Gym for this user (owner)
      const gym = await this.gymModel.create({
        name: dto.gymName || `${dto.name}'s Gym`,
        monthlyFee: 3000,
        ownerId: created._id,
        subscriptionStatus: 'active',
      });

      // Create default settings for this user
      const settings = await this.settingsModel.create({
        userId: created._id,
        monthlyFee: gym.monthlyFee || 3000,
      });

      // Attach gymId to user
      await this.userModel.findByIdAndUpdate(created._id, { gymId: gym._id }).exec();

      console.log('AuthService.signup created user, gym, settings:', { user: created._id.toString(), gym: gym._id.toString(), settings: settings._id.toString() });

      const user = created.toObject();
      (user as any).password = undefined;
      user.gymId = gym._id;
      return user;
    } catch (err: any) {
      // Convert Mongo duplicate key error into a ConflictException
      if (err && err.code === 11000) {
        throw new ConflictException('A user with that email/username already exists');
      }
      throw err;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email }).exec();
    if (!user) throw new UnauthorizedException('User not found');

    const match = await bcrypt.compare(dto.password, user.password);
    if (!match) throw new UnauthorizedException('Incorrect password');

    const payload = { sub: user._id.toString(), email: user.email, role: user.role };
    const secret = process.env.JWT_SECRET || 'change-me';
    const token = jwt.sign(payload, secret, { expiresIn: '7d' });

    const safe = user.toObject();
    (safe as any).password = undefined;

    return { accessToken: token, user: safe };
  }
}
