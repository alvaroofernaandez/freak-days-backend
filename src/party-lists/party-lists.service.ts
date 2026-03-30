import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { IdentityContextService } from '../common/identity/identity-context.service';
import { PrismaService } from '../common/prisma/prisma.service';

export type PartyListType = 'anime' | 'manga' | 'quests' | 'tier_list';

export interface PartyListItemView {
  id: string;
  listId: string;
  addedBy: string | null;
  title: string;
  status: string;
  currentEpisode: number;
  totalEpisodes: number | null;
  score: number | null;
  notes: string | null;
  coverUrl: string | null;
  startDate: Date | null;
  endDate: Date | null;
  rewatchCount: number;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
  addedByUser?: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export interface PartyListSummaryView {
  id: string;
  partyId: string;
  name: string;
  listType: PartyListType;
  content: unknown | null;
  createdBy: string;
  createdAt: Date;
  creator?: {
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  _count: {
    animeItems: number;
  };
}

export interface PartyListDetailView extends PartyListSummaryView {
  animeItems: PartyListItemView[];
}

export interface CreatePartyListInput {
  name: string;
  listType?: PartyListType;
  type?: PartyListType;
}

export interface UpdatePartyListInput {
  name?: string;
  type?: PartyListType;
  content?: Prisma.InputJsonValue | null;
}

export interface CreatePartyListItemInput {
  title?: string;
  name?: string;
  completed?: boolean;
  status?: string;
  currentEpisode?: number;
  totalEpisodes?: number | null;
  score?: number | null;
  notes?: string | null;
  coverUrl?: string | null;
  cover_url?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  rewatchCount?: number;
}

@Injectable()
export class PartyListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
  ) {}

  async listByParty(
    clerkUserId: string,
    orgId: string | null,
    partyId: string,
  ): Promise<PartyListSummaryView[]> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    await this.assertPartyMembershipOrThrow(partyId, currentUser.id, organization.id);

    const lists = await this.prisma.partyList.findMany({
      where: {
        partyId,
      },
      include: {
        createdByUser: true,
        _count: {
          select: {
            items: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return lists.map((list) => this.toListSummaryView(list));
  }

  async createList(
    clerkUserId: string,
    orgId: string | null,
    partyId: string,
    input: CreatePartyListInput,
  ): Promise<PartyListSummaryView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    await this.assertPartyMembershipOrThrow(partyId, currentUser.id, organization.id);

    const name = this.normalizeListName(input.name);
    const type = this.normalizeListType(input.listType ?? input.type);

    const created = await this.prisma.partyList.create({
      data: {
        partyId,
        name,
        type,
        createdByUserId: currentUser.id,
      },
      include: {
        createdByUser: true,
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    return this.toListSummaryView(created);
  }

  async getListById(
    clerkUserId: string,
    orgId: string | null,
    listId: string,
  ): Promise<PartyListDetailView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const list = await this.prisma.partyList.findUnique({
      where: {
        id: listId,
      },
      include: {
        party: {
          select: {
            id: true,
            organizationId: true,
          },
        },
        createdByUser: true,
        items: {
          include: {
            createdByUser: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!list) {
      throw new NotFoundException('Lista compartida no encontrada');
    }

    if (list.party.organizationId !== organization.id) {
      throw new NotFoundException('Lista compartida no encontrada');
    }

    await this.assertPartyMembershipOrThrow(list.partyId, currentUser.id, organization.id);

    return this.toListDetailView(list);
  }

  async updateList(
    clerkUserId: string,
    orgId: string | null,
    listId: string,
    input: UpdatePartyListInput,
  ): Promise<PartyListDetailView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const existing = await this.prisma.partyList.findUnique({
      where: {
        id: listId,
      },
      include: {
        party: {
          select: {
            id: true,
            organizationId: true,
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Lista compartida no encontrada');
    }

    if (existing.party.organizationId !== organization.id) {
      throw new NotFoundException('Lista compartida no encontrada');
    }

    await this.assertPartyMembershipOrThrow(existing.partyId, currentUser.id, organization.id);

    const data: {
      name?: string;
      type?: PartyListType;
      content?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput;
    } = {};

    if (typeof input.name === 'string') {
      data.name = this.normalizeListName(input.name);
    }

    if (typeof input.type === 'string') {
      data.type = this.normalizeListType(input.type);
    }

    if (input.content !== undefined) {
      data.content = this.normalizeContent(input.content);
    }

    await this.prisma.partyList.update({
      where: {
        id: listId,
      },
      data,
    });

    return this.getListById(clerkUserId, orgId, listId);
  }

  async addListItem(
    clerkUserId: string,
    orgId: string | null,
    listId: string,
    input: CreatePartyListItemInput,
  ): Promise<PartyListItemView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const list = await this.prisma.partyList.findUnique({
      where: {
        id: listId,
      },
      include: {
        party: {
          select: {
            id: true,
            organizationId: true,
          },
        },
      },
    });

    if (!list) {
      throw new NotFoundException('Lista compartida no encontrada');
    }

    if (list.party.organizationId !== organization.id) {
      throw new NotFoundException('Lista compartida no encontrada');
    }

    await this.assertPartyMembershipOrThrow(list.partyId, currentUser.id, organization.id);

    const title = this.normalizeItemTitle(input.title ?? input.name);

    const created = await this.prisma.partyListItem.create({
      data: {
        listId,
        title,
        completed: Boolean(input.completed),
        status: this.normalizeStatus(input.status),
        currentEpisode: this.normalizeNumber(input.currentEpisode, 0),
        totalEpisodes: this.normalizeNullableNumber(input.totalEpisodes),
        score: this.normalizeNullableNumber(input.score),
        notes: this.normalizeOptionalText(input.notes),
        coverUrl: this.normalizeOptionalText(input.coverUrl ?? input.cover_url),
        startDate: this.parseOptionalDate(input.startDate),
        endDate: this.parseOptionalDate(input.endDate),
        rewatchCount: this.normalizeNumber(input.rewatchCount, 0),
        createdByUserId: currentUser.id,
      },
      include: {
        createdByUser: true,
      },
    });

    return this.toListItemView(created);
  }

  async removeListItem(
    clerkUserId: string,
    orgId: string | null,
    listId: string,
    itemId: string,
  ): Promise<{ success: true }> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const item = await this.prisma.partyListItem.findUnique({
      where: {
        id: itemId,
      },
      include: {
        list: {
          include: {
            party: {
              select: {
                id: true,
                organizationId: true,
              },
            },
          },
        },
      },
    });

    if (!item || item.listId !== listId) {
      throw new NotFoundException('Item no encontrado');
    }

    if (item.list.party.organizationId !== organization.id) {
      throw new NotFoundException('Item no encontrado');
    }

    const membership = await this.getPartyMembershipOrThrow(
      item.list.partyId,
      currentUser.id,
      organization.id,
    );

    const canDeleteItem =
      membership.role === 'owner' ||
      membership.role === 'admin' ||
      item.createdByUserId === currentUser.id;

    if (!canDeleteItem) {
      throw new ForbiddenException(
        'No tenés permisos para eliminar este item de la lista',
      );
    }

    await this.prisma.partyListItem.delete({
      where: {
        id: itemId,
      },
    });

    return { success: true };
  }

  private normalizeListName(name: string): string {
    const normalized = typeof name === 'string' ? name.trim() : '';

    if (normalized.length === 0) {
      throw new BadRequestException('El nombre de la lista es obligatorio');
    }

    if (normalized.length > 80) {
      throw new BadRequestException(
        'El nombre de la lista no puede superar 80 caracteres',
      );
    }

    return normalized;
  }

  private normalizeListType(type?: string): PartyListType {
    if (type === 'anime' || type === 'manga' || type === 'quests' || type === 'tier_list') {
      return type;
    }

    throw new BadRequestException(
      'Tipo de lista inválido. Valores permitidos: anime, manga, quests, tier_list',
    );
  }

  private normalizeItemTitle(value?: string): string {
    const title = typeof value === 'string' ? value.trim() : '';

    if (title.length === 0) {
      throw new BadRequestException('El título del item es obligatorio');
    }

    if (title.length > 140) {
      throw new BadRequestException(
        'El título del item no puede superar 140 caracteres',
      );
    }

    return title;
  }

  private normalizeStatus(status?: string): string {
    const normalized = typeof status === 'string' ? status.trim() : '';
    return normalized.length > 0 ? normalized : 'plan_to_watch';
  }

  private normalizeNumber(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      return fallback;
    }

    return Math.max(0, Math.floor(value));
  }

  private normalizeNullableNumber(value?: number | null): number | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== 'number' || Number.isNaN(value)) {
      return null;
    }

    return Math.max(0, Math.floor(value));
  }

  private parseOptionalDate(value?: string | null): Date | null {
    if (!value || value.trim().length === 0) {
      return null;
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Fecha inválida en item de lista compartida');
    }

    return parsed;
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeContent(
    value: Prisma.InputJsonValue | null,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput {
    if (value === null) {
      return Prisma.JsonNull;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      Array.isArray(value) ||
      (typeof value === 'object' && value !== null)
    ) {
      return value;
    }

    throw new BadRequestException('El contenido de la lista no tiene formato JSON válido');
  }

  private toListItemView(item: {
    id: string;
    listId: string;
    title: string;
    status: string;
    currentEpisode: number;
    totalEpisodes: number | null;
    score: number | null;
    notes: string | null;
    coverUrl: string | null;
    startDate: Date | null;
    endDate: Date | null;
    rewatchCount: number;
    completed: boolean;
    createdAt: Date;
    updatedAt: Date;
    createdByUser: {
      clerkUserId: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    } | null;
  }): PartyListItemView {
    return {
      id: item.id,
      listId: item.listId,
      addedBy: item.createdByUser?.clerkUserId ?? null,
      title: item.title,
      status: item.status,
      currentEpisode: item.currentEpisode,
      totalEpisodes: item.totalEpisodes,
      score: item.score,
      notes: item.notes,
      coverUrl: item.coverUrl,
      startDate: item.startDate,
      endDate: item.endDate,
      rewatchCount: item.rewatchCount,
      completed: item.completed,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      addedByUser: item.createdByUser
        ? {
            username: this.buildUsername(item.createdByUser),
            displayName: this.buildDisplayName(item.createdByUser),
            avatarUrl: null,
          }
        : undefined,
    };
  }

  private toListSummaryView(list: {
    id: string;
    partyId: string;
    name: string;
    type: PartyListType;
    content: unknown;
    createdAt: Date;
    createdByUser: {
      clerkUserId: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    };
    _count: {
      items: number;
    };
  }): PartyListSummaryView {
    return {
      id: list.id,
      partyId: list.partyId,
      name: list.name,
      listType: list.type,
      content: list.content,
      createdBy: list.createdByUser.clerkUserId,
      createdAt: list.createdAt,
      creator: {
        username: this.buildUsername(list.createdByUser),
        displayName: this.buildDisplayName(list.createdByUser),
        avatarUrl: null,
      },
      _count: {
        animeItems: list._count.items,
      },
    };
  }

  private toListDetailView(list: {
    id: string;
    partyId: string;
    name: string;
    type: PartyListType;
    content: unknown;
    createdAt: Date;
    createdByUser: {
      clerkUserId: string;
      email: string | null;
      firstName: string | null;
      lastName: string | null;
    };
    items: Array<{
      id: string;
      listId: string;
      title: string;
      status: string;
      currentEpisode: number;
      totalEpisodes: number | null;
      score: number | null;
      notes: string | null;
      coverUrl: string | null;
      startDate: Date | null;
      endDate: Date | null;
      rewatchCount: number;
      completed: boolean;
      createdAt: Date;
      updatedAt: Date;
      createdByUser: {
        clerkUserId: string;
        email: string | null;
        firstName: string | null;
        lastName: string | null;
      } | null;
    }>;
  }): PartyListDetailView {
    return {
      id: list.id,
      partyId: list.partyId,
      name: list.name,
      listType: list.type,
      content: list.content,
      createdBy: list.createdByUser.clerkUserId,
      createdAt: list.createdAt,
      creator: {
        username: this.buildUsername(list.createdByUser),
        displayName: this.buildDisplayName(list.createdByUser),
        avatarUrl: null,
      },
      _count: {
        animeItems: list.items.length,
      },
      animeItems: list.items.map((item) => this.toListItemView(item)),
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
  ): Promise<{
    currentUser: { id: string; clerkUserId: string };
    organization: { id: string; clerkOrgId: string | null };
  }> {
    const orgContext = this.assertOrgContext(orgId);
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

  private async assertPartyMembershipOrThrow(
    partyId: string,
    currentUserId: string,
    organizationId: string,
  ): Promise<void> {
    await this.getPartyMembershipOrThrow(partyId, currentUserId, organizationId);
  }

  private async getPartyMembershipOrThrow(
    partyId: string,
    currentUserId: string,
    organizationId: string,
  ): Promise<{ role: 'owner' | 'admin' | 'member' }> {
    const party = await this.prisma.party.findUnique({
      where: {
        id: partyId,
      },
      select: {
        id: true,
        organizationId: true,
      },
    });

    if (!party || party.organizationId !== organizationId) {
      throw new NotFoundException('Party no encontrada');
    }

    const membership = await this.prisma.partyMember.findUnique({
      where: {
        partyId_userId: {
          partyId,
          userId: currentUserId,
        },
      },
      select: {
        role: true,
      },
    });

    if (!membership) {
      throw new ForbiddenException('No tenés acceso a esta party');
    }

    return {
      role: membership.role,
    };
  }
}
