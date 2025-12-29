import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  // Use `any` for request/response types to avoid requiring @types/express during build
  use(req: any, res: any, next: any) {
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
