import { BadRequestException, Injectable } from '@nestjs/common';

import { IdentityContextService } from '../common/identity/identity-context.service';

@Injectable()
export class QuestsNotificationsService {
  constructor(private readonly identityContext: IdentityContextService) {}

  async checkOverdue(
    clerkUserId: string,
    orgId: string | null,
  ): Promise<{ updatedCount: number }> {
    await this.resolveIdentityInOrganization(clerkUserId, orgId);

    return {
      updatedCount: 0,
    };
  }

  async checkDueSoon(
    clerkUserId: string,
    orgId: string | null,
  ): Promise<{ updatedCount: number }> {
    await this.resolveIdentityInOrganization(clerkUserId, orgId);

    return {
      updatedCount: 0,
    };
  }

  private assertOrgContext(orgContext: string | null): string {
    if (!orgContext || orgContext.trim().length === 0) {
      throw new BadRequestException(
        'Falta contexto de organización. Enviá x-org-id para continuar.',
      );
    }

    return orgContext.trim();
  }

  private async resolveIdentityInOrganization(
    clerkUserId: string,
    orgId: string | null,
  ): Promise<void> {
    const orgContext = this.assertOrgContext(orgId);
    const [currentUser, organization] = await Promise.all([
      this.identityContext.getActiveUserByClerkIdOrThrow(clerkUserId),
      this.identityContext.getActiveOrganizationByContextOrThrow(orgContext),
    ]);

    await this.identityContext.assertMembershipOrThrow(currentUser.id, organization.id);
  }
}
