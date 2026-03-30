import { Injectable } from '@nestjs/common';
import { MembershipRole } from '@prisma/client';

import { IdentityContextService } from '../common/identity/identity-context.service';
import { PrismaService } from '../common/prisma/prisma.service';

export interface OrganizationMembershipSummary {
  organizationId: string;
  clerkOrgId: string | null;
  slug: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
  ) {}

  async getMyOrganizations(clerkUserId: string): Promise<OrganizationMembershipSummary[]> {
    const user = await this.identityContext.getActiveUserByClerkIdOrThrow(clerkUserId);

    const memberships = await this.prisma.membership.findMany({
      where: {
        userId: user.id,
        organization: {
          isActive: true,
        },
      },
      select: {
        role: true,
        organization: {
          select: {
            id: true,
            clerkOrgId: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    const organizationMemberships = memberships.map((membership) => ({
      organizationId: membership.organization.id,
      clerkOrgId: membership.organization.clerkOrgId,
      slug: membership.organization.slug,
      name: membership.organization.name,
      role: membership.role,
    }));

    return this.sortMemberships(organizationMemberships);
  }

  private sortMemberships(
    memberships: OrganizationMembershipSummary[],
  ): OrganizationMembershipSummary[] {
    const roleWeight: Record<MembershipRole, number> = {
      owner: 0,
      admin: 1,
      member: 2,
    };

    return [...memberships].sort((a, b) => {
      const roleDiff = roleWeight[a.role] - roleWeight[b.role];

      if (roleDiff !== 0) {
        return roleDiff;
      }

      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });
  }
}
