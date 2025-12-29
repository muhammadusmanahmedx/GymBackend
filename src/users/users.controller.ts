import { Controller, Get, Headers, ForbiddenException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';

const jwt = require('jsonwebtoken');

@Controller()
export class UsersController {
  constructor(@InjectModel(User.name) private userModel: Model<UserDocument>) {}

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
    // return users directly from users collection (lean)
    const users = await this.userModel.find().lean().exec();
    return users;
  }
}
