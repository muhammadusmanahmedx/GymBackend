import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request & { user?: any }, res: Response, next: NextFunction) {
    const auth = req.headers['authorization'] as string | undefined;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const token = auth.slice(7);
    const secret = process.env.JWT_SECRET || 'change-me';
    try {
      const decoded = jwt.verify(token, secret) as any;
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  }
}
