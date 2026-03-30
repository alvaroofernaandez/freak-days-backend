import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { IdentityContextService } from '../common/identity/identity-context.service';
import { PrismaService } from '../common/prisma/prisma.service';

export type MangaStatus = 'collecting' | 'completed' | 'dropped' | 'wishlist';

type NumberInput = number | string | null | undefined;

export interface MangaView {
  id: string;
  title: string;
  author: string | null;
  totalVolumes: number | null;
  ownedVolumes: number[];
  status: MangaStatus;
  score: number | null;
  notes: string | null;
  coverUrl: string | null;
  pricePerVolume: number | null;
  totalCost: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMangaInput {
  title: string;
  author?: string | null;
  totalVolumes?: NumberInput;
  total_volumes?: NumberInput;
  ownedVolumes?: NumberInput[];
  status?: MangaStatus;
  score?: NumberInput;
  notes?: string | null;
  coverUrl?: string | null;
  cover_url?: string | null;
  pricePerVolume?: NumberInput;
  price_per_volume?: NumberInput;
  totalCost?: NumberInput;
  total_cost?: NumberInput;
}

export interface UpdateMangaInput {
  title?: string;
  author?: string | null;
  totalVolumes?: NumberInput;
  total_volumes?: NumberInput;
  ownedVolumes?: NumberInput[];
  status?: MangaStatus;
  score?: NumberInput;
  notes?: string | null;
  coverUrl?: string | null;
  cover_url?: string | null;
  pricePerVolume?: NumberInput;
  price_per_volume?: NumberInput;
  totalCost?: NumberInput;
  total_cost?: NumberInput;
}

@Injectable()
export class MangaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
  ) {}

  async list(clerkUserId: string, orgId: string | null): Promise<MangaView[]> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const entries = await this.prisma.mangaEntry.findMany({
      where: {
        userId: currentUser.id,
        organizationId: organization.id,
      },
      orderBy: {
        title: 'asc',
      },
    });

    return entries.map((entry) => this.toMangaView(entry));
  }

  async create(
    clerkUserId: string,
    orgId: string | null,
    input: CreateMangaInput,
  ): Promise<MangaView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const title = this.normalizeTitle(input.title);
    const ownedVolumes = this.normalizeOwnedVolumes(input.ownedVolumes ?? []);
    const pricePerVolume = this.normalizeOptionalFloat(
      input.pricePerVolume ?? input.price_per_volume,
      'pricePerVolume',
    );
    const totalCost = this.normalizeOptionalFloat(
      input.totalCost ?? input.total_cost,
      'totalCost',
    );

    const created = await this.prisma.mangaEntry.create({
      data: {
        userId: currentUser.id,
        organizationId: organization.id,
        title,
        author: this.normalizeOptionalText(input.author),
        totalVolumes: this.normalizeOptionalInteger(
          input.totalVolumes ?? input.total_volumes,
          'totalVolumes',
        ),
        ownedVolumes,
        status: this.normalizeStatus(input.status, 'collecting'),
        score: this.normalizeOptionalInteger(input.score, 'score'),
        notes: this.normalizeOptionalText(input.notes),
        coverUrl: this.normalizeOptionalText(input.coverUrl ?? input.cover_url),
        pricePerVolume,
        totalCost,
      },
    });

    return this.toMangaView(created);
  }

  async update(
    clerkUserId: string,
    orgId: string | null,
    id: string,
    input: UpdateMangaInput,
  ): Promise<MangaView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const existing = await this.prisma.mangaEntry.findFirst({
      where: {
        id,
        userId: currentUser.id,
        organizationId: organization.id,
      },
    });

    if (!existing) {
      throw new NotFoundException('Manga no encontrado');
    }

    const data: Prisma.MangaEntryUpdateInput = {};

    if (input.title !== undefined) {
      data.title = this.normalizeTitle(input.title);
    }

    if (input.author !== undefined) {
      data.author = this.normalizeOptionalText(input.author);
    }

    if (input.totalVolumes !== undefined || input.total_volumes !== undefined) {
      data.totalVolumes = this.normalizeOptionalInteger(
        input.totalVolumes ?? input.total_volumes,
        'totalVolumes',
      );
    }

    if (input.ownedVolumes !== undefined) {
      data.ownedVolumes = this.normalizeOwnedVolumes(input.ownedVolumes);
    }

    if (input.status !== undefined) {
      data.status = this.normalizeStatus(input.status, 'collecting');
    }

    if (input.score !== undefined) {
      data.score = this.normalizeOptionalInteger(input.score, 'score');
    }

    if (input.notes !== undefined) {
      data.notes = this.normalizeOptionalText(input.notes);
    }

    if (input.coverUrl !== undefined || input.cover_url !== undefined) {
      data.coverUrl = this.normalizeOptionalText(input.coverUrl ?? input.cover_url);
    }

    if (input.pricePerVolume !== undefined || input.price_per_volume !== undefined) {
      data.pricePerVolume = this.normalizeOptionalFloat(
        input.pricePerVolume ?? input.price_per_volume,
        'pricePerVolume',
      );
    }

    if (input.totalCost !== undefined || input.total_cost !== undefined) {
      data.totalCost = this.normalizeOptionalFloat(
        input.totalCost ?? input.total_cost,
        'totalCost',
      );
    }

    const updated =
      Object.keys(data).length === 0
        ? existing
        : await this.prisma.mangaEntry.update({
            where: {
              id: existing.id,
            },
            data,
          });

    return this.toMangaView(updated);
  }

  async remove(
    clerkUserId: string,
    orgId: string | null,
    id: string,
  ): Promise<{ success: true }> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const deleted = await this.prisma.mangaEntry.deleteMany({
      where: {
        id,
        userId: currentUser.id,
        organizationId: organization.id,
      },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('Manga no encontrado');
    }

    return { success: true };
  }

  private normalizeTitle(value: string): string {
    const title = typeof value === 'string' ? value.trim() : '';

    if (title.length === 0) {
      throw new BadRequestException('El título es obligatorio');
    }

    if (title.length > 180) {
      throw new BadRequestException('El título no puede superar 180 caracteres');
    }

    return title;
  }

  private normalizeStatus(value: string | undefined, fallback: MangaStatus): MangaStatus;
  private normalizeStatus(
    value: string | undefined,
    fallback: MangaStatus | undefined,
  ): MangaStatus | undefined;
  private normalizeStatus(
    value: string | undefined,
    fallback: MangaStatus | undefined,
  ): MangaStatus | undefined {
    const normalized = (value ?? '').trim();

    if (normalized.length === 0) {
      return fallback;
    }

    if (
      normalized === 'collecting' ||
      normalized === 'completed' ||
      normalized === 'dropped' ||
      normalized === 'wishlist'
    ) {
      return normalized;
    }

    throw new BadRequestException('Estado de manga inválido');
  }

  private normalizeOptionalText(value?: string | null): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeInteger(value: NumberInput, field: string, fallback: number): number {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }

    const parsed = typeof value === 'string' ? Number(value) : value;

    if (typeof parsed !== 'number' || Number.isNaN(parsed)) {
      throw new BadRequestException(`El campo ${field} debe ser numérico`);
    }

    if (parsed < 0) {
      throw new BadRequestException(`El campo ${field} no puede ser negativo`);
    }

    return Math.floor(parsed);
  }

  private normalizeOptionalInteger(value: NumberInput, field: string): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    return this.normalizeInteger(value, field, 0);
  }

  private normalizeOptionalFloat(value: NumberInput, field: string): number | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = typeof value === 'string' ? Number(value) : value;

    if (typeof parsed !== 'number' || Number.isNaN(parsed)) {
      throw new BadRequestException(`El campo ${field} debe ser numérico`);
    }

    if (parsed < 0) {
      throw new BadRequestException(`El campo ${field} no puede ser negativo`);
    }

    return Math.round(parsed * 100) / 100;
  }

  private normalizeOwnedVolumes(values: NumberInput[]): number[] {
    const normalized = values.map((value, index) =>
      this.normalizeInteger(value, `ownedVolumes[${index}]`, 0),
    );

    return [...new Set(normalized)].sort((a, b) => a - b);
  }

  private toMangaView(entry: {
    id: string;
    title: string;
    author: string | null;
    totalVolumes: number | null;
    ownedVolumes: number[];
    status: MangaStatus;
    score: number | null;
    notes: string | null;
    coverUrl: string | null;
    pricePerVolume: number | null;
    totalCost: number | null;
    createdAt: Date;
    updatedAt: Date;
  }): MangaView {
    return {
      id: entry.id,
      title: entry.title,
      author: entry.author,
      totalVolumes: entry.totalVolumes,
      ownedVolumes: entry.ownedVolumes,
      status: entry.status,
      score: entry.score,
      notes: entry.notes,
      coverUrl: entry.coverUrl,
      pricePerVolume: entry.pricePerVolume,
      totalCost: entry.totalCost,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
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
