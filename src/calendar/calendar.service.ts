import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { IdentityContextService } from '../common/identity/identity-context.service';
import { PrismaService } from '../common/prisma/prisma.service';

export type ReleaseType = 'anime_episode' | 'manga_volume' | 'event';

export interface CalendarReleaseView {
  id: string;
  title: string;
  type: ReleaseType;
  releaseDate: Date;
  description: string | null;
  url: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCalendarReleaseInput {
  title: string;
  type: ReleaseType;
  releaseDate?: string;
  release_date?: string;
  description?: string | null;
  url?: string | null;
}

export interface UpdateCalendarReleaseInput {
  title?: string;
  type?: ReleaseType;
  releaseDate?: string;
  release_date?: string;
  description?: string | null;
  url?: string | null;
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
  ) {}

  async listReleases(
    clerkUserId: string,
    orgId: string | null,
  ): Promise<CalendarReleaseView[]> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const releases = await this.prisma.releaseCalendar.findMany({
      where: {
        userId: currentUser.id,
        organizationId: organization.id,
      },
      orderBy: {
        releaseDate: 'asc',
      },
    });

    return releases.map((release) => this.toReleaseView(release));
  }

  async listUpcomingReleases(
    clerkUserId: string,
    orgId: string | null,
    daysAhead = 30,
  ): Promise<CalendarReleaseView[]> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const futureDate = new Date(today);
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const releases = await this.prisma.releaseCalendar.findMany({
      where: {
        userId: currentUser.id,
        organizationId: organization.id,
        releaseDate: {
          gte: today,
          lte: futureDate,
        },
      },
      orderBy: {
        releaseDate: 'asc',
      },
    });

    return releases.map((release) => this.toReleaseView(release));
  }

  async createRelease(
    clerkUserId: string,
    orgId: string | null,
    input: CreateCalendarReleaseInput,
  ): Promise<CalendarReleaseView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const title = this.normalizeTitle(input.title);
    const type = this.normalizeType(input.type);
    const releaseDate = this.parseReleaseDate(input.releaseDate ?? input.release_date);

    const created = await this.prisma.releaseCalendar.create({
      data: {
        userId: currentUser.id,
        organizationId: organization.id,
        title,
        type,
        releaseDate,
        description: this.normalizeOptionalText(input.description),
        url: this.normalizeOptionalText(input.url),
      },
    });

    return this.toReleaseView(created);
  }

  async updateRelease(
    clerkUserId: string,
    orgId: string | null,
    releaseId: string,
    input: UpdateCalendarReleaseInput,
  ): Promise<CalendarReleaseView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const existing = await this.prisma.releaseCalendar.findUnique({
      where: {
        id: releaseId,
      },
    });

    if (
      !existing ||
      existing.userId !== currentUser.id ||
      existing.organizationId !== organization.id
    ) {
      throw new NotFoundException('Evento de calendario no encontrado');
    }

    const data: {
      title?: string;
      type?: ReleaseType;
      releaseDate?: Date;
      description?: string | null;
      url?: string | null;
    } = {};

    if (typeof input.title === 'string') {
      data.title = this.normalizeTitle(input.title);
    }

    if (typeof input.type === 'string') {
      data.type = this.normalizeType(input.type);
    }

    if (typeof input.releaseDate === 'string' || typeof input.release_date === 'string') {
      data.releaseDate = this.parseReleaseDate(input.releaseDate ?? input.release_date);
    }

    if (input.description !== undefined) {
      data.description = this.normalizeOptionalText(input.description);
    }

    if (input.url !== undefined) {
      data.url = this.normalizeOptionalText(input.url);
    }

    const updated = await this.prisma.releaseCalendar.update({
      where: {
        id: releaseId,
      },
      data,
    });

    return this.toReleaseView(updated);
  }

  async deleteRelease(
    clerkUserId: string,
    orgId: string | null,
    releaseId: string,
  ): Promise<{ success: true }> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const existing = await this.prisma.releaseCalendar.findUnique({
      where: {
        id: releaseId,
      },
      select: {
        id: true,
        userId: true,
        organizationId: true,
      },
    });

    if (
      !existing ||
      existing.userId !== currentUser.id ||
      existing.organizationId !== organization.id
    ) {
      throw new NotFoundException('Evento de calendario no encontrado');
    }

    await this.prisma.releaseCalendar.delete({
      where: {
        id: releaseId,
      },
    });

    return { success: true };
  }

  private normalizeTitle(title: string): string {
    const normalized = typeof title === 'string' ? title.trim() : '';

    if (normalized.length === 0) {
      throw new BadRequestException('El título del evento es obligatorio');
    }

    if (normalized.length > 120) {
      throw new BadRequestException(
        'El título del evento no puede superar 120 caracteres',
      );
    }

    return normalized;
  }

  private normalizeType(type: string): ReleaseType {
    if (type === 'anime_episode' || type === 'manga_volume' || type === 'event') {
      return type;
    }

    throw new BadRequestException(
      'Tipo inválido. Valores permitidos: anime_episode, manga_volume, event',
    );
  }

  private parseReleaseDate(value?: string): Date {
    const normalized = typeof value === 'string' ? value.trim() : '';

    if (normalized.length === 0) {
      throw new BadRequestException(
        'releaseDate/release_date es obligatorio en formato YYYY-MM-DD',
      );
    }

    const parsed = new Date(`${normalized}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(
        'releaseDate/release_date inválido. Formato esperado: YYYY-MM-DD',
      );
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

  private toReleaseView(release: {
    id: string;
    title: string;
    type: ReleaseType;
    releaseDate: Date;
    description: string | null;
    url: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): CalendarReleaseView {
    return {
      id: release.id,
      title: release.title,
      type: release.type,
      releaseDate: release.releaseDate,
      description: release.description,
      url: release.url,
      createdAt: release.createdAt,
      updatedAt: release.updatedAt,
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
}
