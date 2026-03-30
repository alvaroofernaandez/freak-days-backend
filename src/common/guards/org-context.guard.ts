import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../../auth/constants';

@Injectable()
export class OrgContextGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const headerOrgId = request.headers['x-org-id'];

    if (typeof headerOrgId === 'string' && headerOrgId.length > 0) {
      request.orgId = headerOrgId;
      return true;
    }

    const jwtOrgId =
      request.user !== undefined && typeof request.user.org_id === 'string'
        ? request.user.org_id
        : null;

    if (jwtOrgId !== null && jwtOrgId.length > 0) {
      request.orgId = jwtOrgId;
    }

    return true;
  }
}
