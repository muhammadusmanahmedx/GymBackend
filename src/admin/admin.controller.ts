import { Controller, Get, Put, Param, Body, Headers, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { Gym, GymDocument } from '../schemas/gym.schema';

const jwt = require('jsonwebtoken');

@Controller('admin')
export class AdminController {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Gym.name) private gymModel: Model<GymDocument>,
  ) {}

  private async getRequester(authorization?: string) {
    if (!authorization) return null;
    try {
      const token = authorization.replace(/^Bearer\s+/i, '');
      const secret = process.env.JWT_SECRET || 'change-me';
      const decoded: any = jwt.verify(token, secret);
      if (!decoded?.sub) return null;
      const user = await this.userModel.findById(decoded.sub).lean().exec();
      return user as any;
    } catch (e) {
      return null;
    }
  }

  @Get('users')
  async listUsers(@Headers('authorization') authorization?: string) {
    const requester = await this.getRequester(authorization);
    if (!requester || requester.role !== 'superbadmin') throw new ForbiddenException();
    const users = await this.userModel.find().lean().exec();
    // attach gym info if present
    const out = await Promise.all(users.map(async (u: any) => {
      let gym = null;
      if (u.gymId) gym = await this.gymModel.findById(u.gymId).lean().exec();
      return { ...u, gym: gym ? { name: gym.name, location: gym.location || '', _id: gym._id } : null };
    }));
    return out;
  }

  @Put('users/:id/authorize')
  async setAuthorized(@Param('id') id: string, @Body() body: { authorized: boolean }, @Headers('authorization') authorization?: string) {
    const requester = await this.getRequester(authorization);
    if (!requester || requester.role !== 'superbadmin') throw new ForbiddenException();
    const target = await this.userModel.findById(id).exec();
    if (!target) throw new NotFoundException('User not found');
    target.authorized = !!body.authorized;
    await target.save();
    return { success: true, user: target };
  }
}
