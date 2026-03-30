import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface ActiveIdentityUser {
  id: string;
  clerkUserId: string;
}

export interface ActiveIdentityOrganization {
  id: string;
  clerkOrgId: string | null;
}

@Injectable()
export class IdentityContextService {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveUserByClerkIdOrThrow(
    clerkUserId: string,
  ): Promise<ActiveIdentityUser> {
    const user = await this.prisma.user.findFirst({
      where: {
        clerkUserId,
        isActive: true,
      },
      select: {
        id: true,
        clerkUserId: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        'Usuario no provisionado en backend. Esperá la sincronización por webhook de Clerk.',
      );
    }

    return user;
  }

  async getActiveOrganizationByContextOrThrow(
    orgContext: string,
  ): Promise<ActiveIdentityOrganization> {
    const organization = await this.prisma.organization.findFirst({
      where: {
        isActive: true,
        OR: [{ id: orgContext }, { clerkOrgId: orgContext }],
      },
      select: {
        id: true,
        clerkOrgId: true,
      },
    });

    if (!organization) {
      throw new NotFoundException(
        'La organización no existe, está inactiva o no fue provisionada por webhook de Clerk.',
      );
    }

    return organization;
  }

  async assertMembershipOrThrow(
    userId: string,
    organizationId: string,
  ): Promise<void> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        userId,
        organizationId,
        user: {
          isActive: true,
        },
        organization: {
          isActive: true,
        },
      },
      select: {
        id: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'El usuario no tiene membresía activa en la organización. Verificá el provisioning por webhook de Clerk.',
      );
    }
  }
}
