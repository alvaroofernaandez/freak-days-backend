import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PartyMemberRole, Prisma } from '@prisma/client';

import { IdentityContextService } from '../common/identity/identity-context.service';
import { PrismaService } from '../common/prisma/prisma.service';

export interface PartyMemberView {
  id: string;
  partyId: string;
  userId: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: Date;
  profile?: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface PartyView {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  inviteCode: string;
  ownerId: string;
  maxMembers: number;
  createdAt: Date;
  updatedAt: Date;
  members: PartyMemberView[];
}

export interface CreatePartyInput {
  name: string;
  description?: string;
  maxMembers?: number;
}

export interface JoinPartyInput {
  inviteCode: string;
}

type PartyWithRelations = Prisma.PartyGetPayload<{
  include: {
    owner: true;
    members: {
      include: {
        user: true;
      };
    };
  };
}>;

@Injectable()
export class PartyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
  ) {}

  async listForCurrentUser(
    clerkUserId: string,
    orgId: string | null,
  ): Promise<PartyView[]> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const parties = await this.prisma.party.findMany({
      where: {
        organizationId: organization.id,
        members: {
          some: {
            userId: currentUser.id,
          },
        },
      },
      include: {
        owner: true,
        members: {
          include: {
            user: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return parties.map((party) => this.toPartyView(party));
  }

  async createParty(
    clerkUserId: string,
    orgId: string | null,
    input: CreatePartyInput,
  ): Promise<PartyView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );
    const partyName = input.name.trim();

    if (partyName.length === 0) {
      throw new BadRequestException('El nombre de la party es obligatorio');
    }

    const maxMembers =
      typeof input.maxMembers === 'number' && input.maxMembers > 1
        ? input.maxMembers
        : 10;

    const created = await this.prisma.party.create({
      data: {
        organizationId: organization.id,
        name: partyName,
        description: input.description?.trim() || null,
        inviteCode: await this.generateUniqueInviteCode(),
        ownerId: currentUser.id,
        maxMembers,
        members: {
          create: {
            userId: currentUser.id,
            role: PartyMemberRole.owner,
          },
        },
      },
      include: {
        owner: true,
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    return this.toPartyView(created);
  }

  async joinByCode(
    clerkUserId: string,
    orgId: string | null,
    input: JoinPartyInput,
  ): Promise<PartyView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );
    const inviteCode = input.inviteCode.trim().toUpperCase();

    if (inviteCode.length !== 6) {
      throw new BadRequestException('El código de invitación debe tener 6 caracteres');
    }

    const party = await this.prisma.party.findUnique({
      where: { inviteCode },
      include: {
        owner: true,
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!party || party.organizationId !== organization.id) {
      throw new NotFoundException('Código de invitación inválido');
    }

    if (party.members.some((member) => member.userId === currentUser.id)) {
      throw new ConflictException('Ya sos miembro de esta party');
    }

    if (party.members.length >= party.maxMembers) {
      throw new ConflictException('La party alcanzó el límite de miembros');
    }

    await this.prisma.partyMember.create({
      data: {
        partyId: party.id,
        userId: currentUser.id,
        role: PartyMemberRole.member,
      },
    });

    const updatedParty = await this.getPartyWithRelationsById(party.id);
    return this.toPartyView(updatedParty);
  }

  async getPartyById(
    clerkUserId: string,
    orgId: string | null,
    partyId: string,
  ): Promise<PartyView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );
    const party = await this.getPartyWithRelationsById(partyId);

    if (party.organizationId !== organization.id) {
      throw new NotFoundException('Party no encontrada');
    }

    const actorMembership = party.members.find(
      (member) => member.userId === currentUser.id,
    );

    if (!actorMembership) {
      throw new ForbiddenException('No tenés acceso a esta party');
    }

    return this.toPartyView(party);
  }

  async leaveParty(
    clerkUserId: string,
    orgId: string | null,
    partyId: string,
  ): Promise<{ success: true }> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );
    const party = await this.getPartyWithRelationsById(partyId);

    if (party.organizationId !== organization.id) {
      throw new NotFoundException('Party no encontrada');
    }

    const actorMembership = party.members.find(
      (member) => member.userId === currentUser.id,
    );

    if (!actorMembership) {
      throw new NotFoundException('No sos miembro de esta party');
    }

    if (actorMembership.role === PartyMemberRole.owner) {
      throw new BadRequestException(
        'El dueño no puede abandonar la party. Eliminála para cerrarla',
      );
    }

    await this.prisma.partyMember.delete({
      where: {
        partyId_userId: {
          partyId,
          userId: currentUser.id,
        },
      },
    });

    return { success: true };
  }

  async regenerateInviteCode(
    clerkUserId: string,
    orgId: string | null,
    partyId: string,
  ): Promise<{ inviteCode: string }> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );
    const party = await this.getPartyWithRelationsById(partyId);

    if (party.organizationId !== organization.id) {
      throw new NotFoundException('Party no encontrada');
    }

    const actorMembership = party.members.find(
      (member) => member.userId === currentUser.id,
    );

    const canRegenerateInviteCode =
      actorMembership?.role === PartyMemberRole.owner ||
      actorMembership?.role === PartyMemberRole.admin;

    if (!canRegenerateInviteCode) {
      throw new ForbiddenException('Solo owner/admin puede regenerar el código');
    }

    const inviteCode = await this.generateUniqueInviteCode(party.id);

    await this.prisma.party.update({
      where: { id: party.id },
      data: { inviteCode },
    });

    return { inviteCode };
  }

  async deleteParty(
    clerkUserId: string,
    orgId: string | null,
    partyId: string,
  ): Promise<{ success: true }> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );
    const party = await this.getPartyWithRelationsById(partyId);

    if (party.organizationId !== organization.id) {
      throw new NotFoundException('Party no encontrada');
    }

    if (party.ownerId !== currentUser.id) {
      throw new ForbiddenException('Solo el owner puede eliminar la party');
    }

    await this.prisma.party.delete({
      where: { id: party.id },
    });

    return { success: true };
  }

  async removeMember(
    clerkUserId: string,
    orgId: string | null,
    partyId: string,
    memberClerkUserId: string,
  ): Promise<{ success: true }> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );
    const party = await this.getPartyWithRelationsById(partyId);

    if (party.organizationId !== organization.id) {
      throw new NotFoundException('Party no encontrada');
    }

    const actorMembership = party.members.find(
      (member) => member.userId === currentUser.id,
    );

    const canRemoveMembers =
      actorMembership?.role === PartyMemberRole.owner ||
      actorMembership?.role === PartyMemberRole.admin;

    if (!canRemoveMembers) {
      throw new ForbiddenException('Solo owner/admin puede expulsar miembros');
    }

    const targetUser = await this.prisma.user.findFirst({
      where: {
        clerkUserId: memberClerkUserId,
        isActive: true,
      },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundException('Miembro no encontrado');
    }

    const targetMembership = party.members.find(
      (member) => member.userId === targetUser.id,
    );

    if (!targetMembership) {
      throw new NotFoundException('Miembro no encontrado');
    }

    if (targetMembership.role === PartyMemberRole.owner) {
      throw new BadRequestException('No se puede remover al owner de la party');
    }

    if (targetMembership.userId === currentUser.id) {
      throw new BadRequestException('No podés removerte a vos mismo');
    }

    await this.prisma.partyMember.delete({
      where: {
        partyId_userId: {
          partyId,
          userId: targetUser.id,
        },
      },
    });

    return { success: true };
  }

  private async getPartyWithRelationsById(partyId: string) {
    const party = await this.prisma.party.findUnique({
      where: { id: partyId },
      include: {
        owner: true,
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!party) {
      throw new NotFoundException('Party no encontrada');
    }

    return party;
  }

  private toPartyView(party: PartyWithRelations): PartyView {
    return {
      id: party.id,
      organizationId: party.organizationId,
      name: party.name,
      description: party.description,
      inviteCode: party.inviteCode,
      ownerId: party.owner.clerkUserId,
      maxMembers: party.maxMembers,
      createdAt: party.createdAt,
      updatedAt: party.updatedAt,
      members: this.sortMembersByRoleAndDate(
        party.members.map((member) => ({
          id: member.id,
          partyId: member.partyId,
          userId: member.user.clerkUserId,
          role: member.role,
          joinedAt: member.joinedAt,
          profile: {
            username: this.buildUsername(member.user),
            displayName: this.buildDisplayName(member.user),
            avatarUrl: null,
          },
        })),
      ),
    };
  }

  private buildUsername(user: {
    clerkUserId: string;
    email: string | null;
  }): string {
    if (user.email && user.email.includes('@')) {
      const username = user.email.split('@')[0];
      if (username && username.length > 0) {
        return username;
      }
    }

    return user.clerkUserId;
  }

  private buildDisplayName(user: {
    firstName: string | null;
    lastName: string | null;
  }): string | null {
    const firstName = user.firstName?.trim() ?? '';
    const lastName = user.lastName?.trim() ?? '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName.length > 0 ? fullName : null;
  }

  private sortMembersByRoleAndDate(members: PartyMemberView[]): PartyMemberView[] {
    return [...members].sort((a, b) => {
      const roleWeight: Record<PartyMemberView['role'], number> = {
        owner: 0,
        admin: 1,
        member: 2,
      };

      const roleDiff = roleWeight[a.role] - roleWeight[b.role];
      if (roleDiff !== 0) {
        return roleDiff;
      }

      return a.joinedAt.getTime() - b.joinedAt.getTime();
    });
  }

  private assertOrgId(orgId: string | null): string {
    if (!orgId || orgId.trim().length === 0) {
      throw new BadRequestException('Falta orgId para ejecutar la operación');
    }

    return orgId.trim();
  }

  private async resolveIdentityInOrganization(
    clerkUserId: string,
    orgId: string | null,
  ): Promise<{
    currentUser: { id: string; clerkUserId: string };
    organization: { id: string; clerkOrgId: string | null };
  }> {
    const orgContext = this.assertOrgId(orgId);
    const [currentUser, organization] = await Promise.all([
      this.identityContext.getActiveUserByClerkIdOrThrow(clerkUserId),
      this.identityContext.getActiveOrganizationByContextOrThrow(orgContext),
    ]);

    await this.identityContext.assertMembershipOrThrow(currentUser.id, organization.id);

    return {
      currentUser,
      organization,
    };
  }

  private async generateUniqueInviteCode(currentPartyId?: string): Promise<string> {
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const inviteCode = this.createInviteCode();

      const existingParty = await this.prisma.party.findUnique({
        where: { inviteCode },
        select: { id: true },
      });

      if (!existingParty || existingParty.id === currentPartyId) {
        return inviteCode;
      }
    }

    throw new ConflictException('No se pudo generar un inviteCode único');
  }

  private createInviteCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';

    for (let index = 0; index < 6; index += 1) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      code += chars.charAt(randomIndex);
    }

    return code;
  }
}
