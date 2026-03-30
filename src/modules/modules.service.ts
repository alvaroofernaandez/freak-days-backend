import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';

import { IdentityContextService } from '../common/identity/identity-context.service';
import { PrismaService } from '../common/prisma/prisma.service';

export interface UserModulePreferenceView {
  moduleId: string;
  enabled: boolean;
}

export interface SyncUserModuleInput {
  moduleId: string;
  enabled: boolean;
}

export interface SyncUserModulesInput {
  modules: SyncUserModuleInput[];
}

@Injectable()
export class ModulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
  ) {}

  async getMyModules(
    clerkUserId: string,
    orgContext: string | null,
  ): Promise<UserModulePreferenceView[]> {
    const organizationContext = this.assertOrgContext(orgContext);
    const [user, organization] = await Promise.all([
      this.identityContext.getActiveUserByClerkIdOrThrow(clerkUserId),
      this.identityContext.getActiveOrganizationByContextOrThrow(organizationContext),
    ]);

    await this.identityContext.assertMembershipOrThrow(user.id, organization.id);

    return this.listModulesForUserAndOrganization(user.id, organization.id);
  }

  async syncMyModules(
    clerkUserId: string,
    orgContext: string | null,
    input: SyncUserModulesInput,
  ): Promise<{ modules: UserModulePreferenceView[] }> {
    const organizationContext = this.assertOrgContext(orgContext);
    const normalizedModules = this.normalizeModulesInput(input);
    const [user, organization] = await Promise.all([
      this.identityContext.getActiveUserByClerkIdOrThrow(clerkUserId),
      this.identityContext.getActiveOrganizationByContextOrThrow(organizationContext),
    ]);

    await this.identityContext.assertMembershipOrThrow(user.id, organization.id);

    const finalModules = await this.prisma.$transaction(async (tx) => {
      const moduleIds = normalizedModules.map((module) => module.moduleId);

      if (moduleIds.length === 0) {
        await tx.userModulePreference.deleteMany({
          where: {
            userId: user.id,
            organizationId: organization.id,
          },
        });

        return [];
      }

      await Promise.all(
        normalizedModules.map((module) =>
          tx.userModulePreference.upsert({
            where: {
              userId_organizationId_moduleId: {
                userId: user.id,
                organizationId: organization.id,
                moduleId: module.moduleId,
              },
            },
            update: {
              enabled: module.enabled,
            },
            create: {
              userId: user.id,
              organizationId: organization.id,
              moduleId: module.moduleId,
              enabled: module.enabled,
            },
          }),
        ),
      );

      await tx.userModulePreference.deleteMany({
        where: {
          userId: user.id,
          organizationId: organization.id,
          moduleId: {
            notIn: moduleIds,
          },
        },
      });

      const saved = await tx.userModulePreference.findMany({
        where: {
          userId: user.id,
          organizationId: organization.id,
        },
        select: {
          moduleId: true,
          enabled: true,
        },
        orderBy: {
          moduleId: 'asc',
        },
      });

      return saved;
    });

    return {
      modules: finalModules.map((module) => ({
        moduleId: module.moduleId,
        enabled: module.enabled,
      })),
    };
  }

  private async listModulesForUserAndOrganization(
    userId: string,
    organizationId: string,
  ): Promise<UserModulePreferenceView[]> {
    const modules = await this.prisma.userModulePreference.findMany({
      where: {
        userId,
        organizationId,
      },
      select: {
        moduleId: true,
        enabled: true,
      },
      orderBy: {
        moduleId: 'asc',
      },
    });

    return modules.map((module) => ({
      moduleId: module.moduleId,
      enabled: module.enabled,
    }));
  }

  private assertOrgContext(orgContext: string | null): string {
    if (!orgContext || orgContext.trim().length === 0) {
      throw new BadRequestException(
        'Falta contexto de organización. Enviá x-org-id para continuar.',
      );
    }

    return orgContext.trim();
  }

  private normalizeModulesInput(input: SyncUserModulesInput): SyncUserModuleInput[] {
    if (!input || typeof input !== 'object' || !Array.isArray(input.modules)) {
      throw new BadRequestException(
        'Payload inválido. Se esperaba { modules: Array<{ moduleId, enabled }> }',
      );
    }

    const moduleMap = new Map<string, boolean>();

    for (const item of input.modules) {
      if (!item || typeof item !== 'object') {
        throw new BadRequestException('Cada módulo debe ser un objeto válido');
      }

      const moduleId =
        typeof item.moduleId === 'string' ? item.moduleId.trim() : '';

      if (moduleId.length === 0) {
        throw new BadRequestException('moduleId es obligatorio y debe ser string');
      }

      if (typeof item.enabled !== 'boolean') {
        throw new BadRequestException('enabled debe ser boolean');
      }

      moduleMap.set(moduleId, item.enabled);
    }

    return Array.from(moduleMap.entries()).map(([moduleId, enabled]) => ({
      moduleId,
      enabled,
    }));
  }

}
