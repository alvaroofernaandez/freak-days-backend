import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../constants';
import { ClerkJwtStrategy } from '../strategies/clerk-jwt.strategy';

@Injectable()
export class ClerkJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly strategy: ClerkJwtStrategy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;

    if (typeof authorization !== 'string') {
      throw new UnauthorizedException('Falta header Authorization');
    }

    const [scheme, token] = authorization.split(' ');

    if (scheme !== 'Bearer' || typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException('Formato Authorization inválido');
    }

    request.user = await this.strategy.validateToken(token);
    return true;
  }
}
