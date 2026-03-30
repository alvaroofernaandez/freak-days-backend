import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MembershipRole,
  Prisma,
  type Organization,
  type User,
} from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';

import { PrismaService } from '../common/prisma/prisma.service';

interface ClerkSvixHeaders {
  svixId?: string;
  svixTimestamp?: string;
  svixSignature?: string;
}

interface ClerkWebhookEnvelope {
  type: string;
  data: unknown;
}

interface UpsertUserInput {
  clerkUserId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
}

interface UpsertOrganizationInput {
  clerkOrgId: string;
  name?: string;
  slug?: string;
  isActive?: boolean;
}

type PrismaTx = Prisma.TransactionClient;

const WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS = 300;

@Injectable()
export class WebhooksService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async processClerkWebhook(
    payload: string,
    headers: ClerkSvixHeaders,
  ): Promise<void> {
    this.verifySvixSignature(payload, headers);

    const event = this.parseWebhookEvent(payload);

    switch (event.type) {
      case 'user.created':
      case 'user.updated':
        await this.handleUserUpsert(event.data);
        return;
      case 'user.deleted':
        await this.handleUserDeleted(event.data);
        return;
      case 'organization.created':
      case 'organization.updated':
        await this.handleOrganizationUpsert(event.data);
        return;
      case 'organization.deleted':
        await this.handleOrganizationDeleted(event.data);
        return;
      case 'organizationMembership.created':
      case 'organizationMembership.updated':
        await this.handleMembershipUpsert(event.data);
        return;
      case 'organizationMembership.deleted':
        await this.handleMembershipDeleted(event.data);
        return;
      default:
        return;
    }
  }

  private parseWebhookEvent(payload: string): ClerkWebhookEnvelope {
    let parsed: unknown;

    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new BadRequestException('Payload webhook inválido (JSON)');
    }

    if (!this.isRecord(parsed) || typeof parsed.type !== 'string') {
      throw new BadRequestException('Payload webhook inválido (sin type)');
    }

    return {
      type: parsed.type,
      data: parsed.data,
    };
  }

  private verifySvixSignature(payload: string, headers: ClerkSvixHeaders): void {
    const svixId = this.getRequiredHeader(headers.svixId, 'svix-id');
    const timestampRaw = this.getRequiredHeader(
      headers.svixTimestamp,
      'svix-timestamp',
    );
    const svixSignature = this.getRequiredHeader(
      headers.svixSignature,
      'svix-signature',
    );
    const webhookSecret = this.getRequiredSecret();

    const timestamp = Number.parseInt(timestampRaw, 10);

    if (!Number.isFinite(timestamp)) {
      throw new BadRequestException('Header svix-timestamp inválido');
    }

    const currentTimestamp = Math.floor(Date.now() / 1000);
    const timestampDelta = Math.abs(currentTimestamp - timestamp);

    if (timestampDelta > WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS) {
      throw new UnauthorizedException('Webhook fuera de ventana de tolerancia');
    }

    const signatures = this.extractSvixSignatures(svixSignature);

    if (signatures.length === 0) {
      throw new UnauthorizedException('Header svix-signature inválido');
    }

    const payloadToSign = `${svixId}.${timestampRaw}.${payload}`;
    const computedSignature = createHmac('sha256', webhookSecret)
      .update(payloadToSign)
      .digest('base64');

    const isValidSignature = signatures.some((signature) =>
      this.safeCompare(signature, computedSignature),
    );

    if (!isValidSignature) {
      throw new UnauthorizedException('Firma webhook Clerk inválida');
    }
  }

  private getRequiredHeader(value: string | undefined, headerName: string): string {
    if (typeof value !== 'string') {
      throw new BadRequestException(`Falta header ${headerName}`);
    }

    const normalized = value.trim();

    if (normalized.length === 0) {
      throw new BadRequestException(`Header ${headerName} vacío`);
    }

    return normalized;
  }

  private getRequiredSecret(): Buffer {
    const rawSecret = this.configService.get<string>('CLERK_WEBHOOK_SECRET');

    if (typeof rawSecret !== 'string' || rawSecret.trim().length === 0) {
      throw new UnauthorizedException('CLERK_WEBHOOK_SECRET no está configurado');
    }

    const secret = rawSecret.trim();
    const encoded = secret.startsWith('whsec_') ? secret.slice(6) : secret;

    const decoded = Buffer.from(this.normalizeBase64(encoded), 'base64');

    if (decoded.length === 0) {
      throw new UnauthorizedException('CLERK_WEBHOOK_SECRET inválido');
    }

    return decoded;
  }

  private normalizeBase64(value: string): string {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = base64.length % 4;

    if (padding === 0) {
      return base64;
    }

    return `${base64}${'='.repeat(4 - padding)}`;
  }

  private extractSvixSignatures(svixSignatureHeader: string): string[] {
    const signatures: string[] = [];
    const regex = /v1,([^\s,]+)/g;

    let match: RegExpExecArray | null = regex.exec(svixSignatureHeader);

    while (match !== null) {
      const signature = match[1];

      if (typeof signature === 'string' && signature.length > 0) {
        signatures.push(signature.trim());
      }

      match = regex.exec(svixSignatureHeader);
    }

    return signatures;
  }

  private safeCompare(signature: string, expected: string): boolean {
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);

    if (left.length !== right.length) {
      return false;
    }

    return timingSafeEqual(left, right);
  }

  private async handleUserUpsert(data: unknown): Promise<void> {
    const userData = this.extractUserData(data);

    await this.upsertUser(this.prisma, {
      ...userData,
      isActive: true,
    });
  }

  private async handleUserDeleted(data: unknown): Promise<void> {
    const userData = this.extractUserData(data);

    await this.prisma.user.updateMany({
      where: {
        clerkUserId: userData.clerkUserId,
      },
      data: {
        isActive: false,
      },
    });
  }

  private async handleOrganizationUpsert(data: unknown): Promise<void> {
    const organizationData = this.extractOrganizationData(data);

    await this.upsertOrganization(this.prisma, {
      ...organizationData,
      isActive: true,
    });
  }

  private async handleOrganizationDeleted(data: unknown): Promise<void> {
    const organizationData = this.extractOrganizationData(data);

    await this.prisma.organization.updateMany({
      where: {
        clerkOrgId: organizationData.clerkOrgId,
      },
      data: {
        isActive: false,
      },
    });
  }

  private async handleMembershipUpsert(data: unknown): Promise<void> {
    const membership = this.extractMembershipData(data);
    const role = this.mapMembershipRole(membership.role);

    await this.prisma.$transaction(async (tx) => {
      const user = await this.upsertUser(tx, {
        clerkUserId: membership.clerkUserId,
        email: membership.email,
        firstName: membership.firstName,
        lastName: membership.lastName,
        isActive: true,
      });

      const organization = await this.upsertOrganization(tx, {
        clerkOrgId: membership.clerkOrgId,
        name: membership.organizationName,
        slug: membership.organizationSlug,
        isActive: true,
      });

      await tx.membership.upsert({
        where: {
          userId_organizationId: {
            userId: user.id,
            organizationId: organization.id,
          },
        },
        update: {
          role,
        },
        create: {
          userId: user.id,
          organizationId: organization.id,
          role,
        },
      });
    });
  }

  private async handleMembershipDeleted(data: unknown): Promise<void> {
    const membership = this.extractMembershipData(data);

    await this.prisma.$transaction(async (tx) => {
      const [user, organization] = await Promise.all([
        tx.user.findUnique({
          where: {
            clerkUserId: membership.clerkUserId,
          },
          select: { id: true },
        }),
        tx.organization.findUnique({
          where: {
            clerkOrgId: membership.clerkOrgId,
          },
          select: { id: true },
        }),
      ]);

      if (!user || !organization) {
        return;
      }

      await tx.membership.deleteMany({
        where: {
          userId: user.id,
          organizationId: organization.id,
        },
      });
    });
  }

  private async upsertUser(
    prisma: PrismaService | PrismaTx,
    input: UpsertUserInput,
  ): Promise<Pick<User, 'id' | 'clerkUserId'>> {
    const updateData: Prisma.UserUpdateInput = {
      isActive: input.isActive ?? true,
    };

    if (input.email !== undefined) {
      updateData.email = input.email;
    }

    if (input.firstName !== undefined) {
      updateData.firstName = input.firstName;
    }

    if (input.lastName !== undefined) {
      updateData.lastName = input.lastName;
    }

    return prisma.user.upsert({
      where: {
        clerkUserId: input.clerkUserId,
      },
      update: updateData,
      create: {
        clerkUserId: input.clerkUserId,
        email: input.email ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        isActive: input.isActive ?? true,
      },
      select: {
        id: true,
        clerkUserId: true,
      },
    });
  }

  private async upsertOrganization(
    prisma: PrismaService | PrismaTx,
    input: UpsertOrganizationInput,
  ): Promise<Pick<Organization, 'id' | 'clerkOrgId'>> {
    const createDesiredSlug = input.slug ?? input.name ?? input.clerkOrgId;
    const createSlug = await this.resolveUniqueOrganizationSlug(
      prisma,
      createDesiredSlug,
      input.clerkOrgId,
    );

    const updateData: Prisma.OrganizationUpdateInput = {
      isActive: input.isActive ?? true,
    };

    if (input.name !== undefined) {
      updateData.name = this.buildOrganizationName(input.name, input.clerkOrgId);
    }

    if (input.slug !== undefined || input.name !== undefined) {
      const updateDesiredSlug = input.slug ?? input.name ?? input.clerkOrgId;
      updateData.slug = await this.resolveUniqueOrganizationSlug(
        prisma,
        updateDesiredSlug,
        input.clerkOrgId,
      );
    }

    return prisma.organization.upsert({
      where: {
        clerkOrgId: input.clerkOrgId,
      },
      update: updateData,
      create: {
        clerkOrgId: input.clerkOrgId,
        name: this.buildOrganizationName(input.name, input.clerkOrgId),
        slug: createSlug,
        isActive: input.isActive ?? true,
      },
      select: {
        id: true,
        clerkOrgId: true,
      },
    });
  }

  private async resolveUniqueOrganizationSlug(
    prisma: PrismaService | PrismaTx,
    rawSlug: string,
    clerkOrgId: string,
  ): Promise<string> {
    const normalizedBase = this.normalizeSlug(rawSlug);
    let candidate = normalizedBase;
    let suffix = 2;

    while (true) {
      const existing = await prisma.organization.findUnique({
        where: {
          slug: candidate,
        },
        select: {
          clerkOrgId: true,
        },
      });

      if (!existing || existing.clerkOrgId === clerkOrgId) {
        return candidate;
      }

      candidate = `${normalizedBase}-${suffix}`;
      suffix += 1;
    }
  }

  private buildOrganizationName(name: string | undefined, clerkOrgId: string): string {
    const normalized = this.normalizeNullableString(name);

    if (normalized !== null) {
      return normalized;
    }

    const safeSuffix = clerkOrgId.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
    return safeSuffix.length > 0
      ? `Organization ${safeSuffix}`
      : 'Organization';
  }

  private normalizeSlug(rawValue: string): string {
    const normalized = rawValue
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 48);

    if (normalized.length > 0) {
      return normalized;
    }

    return `org-${Date.now().toString(36)}`;
  }

  private mapMembershipRole(rawRole: string | undefined): MembershipRole {
    const normalized = rawRole?.trim().toLowerCase();

    if (normalized?.includes('owner')) {
      return MembershipRole.owner;
    }

    if (normalized?.includes('admin')) {
      return MembershipRole.admin;
    }

    return MembershipRole.member;
  }

  private extractUserData(data: unknown): {
    clerkUserId: string;
    email?: string;
    firstName?: string;
    lastName?: string;
  } {
    const record = this.assertRecord(data, 'data de user');
    const clerkUserId = this.assertString(record.id, 'data.id');

    return {
      clerkUserId,
      email: this.extractPrimaryEmail(record),
      firstName: this.normalizeNullableString(record.first_name) ?? undefined,
      lastName: this.normalizeNullableString(record.last_name) ?? undefined,
    };
  }

  private extractOrganizationData(data: unknown): {
    clerkOrgId: string;
    name?: string;
    slug?: string;
  } {
    const record = this.assertRecord(data, 'data de organization');
    const clerkOrgId = this.assertString(record.id, 'data.id');

    return {
      clerkOrgId,
      name: this.normalizeNullableString(record.name) ?? undefined,
      slug: this.normalizeNullableString(record.slug) ?? undefined,
    };
  }

  private extractMembershipData(data: unknown): {
    clerkUserId: string;
    clerkOrgId: string;
    role?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    organizationName?: string;
    organizationSlug?: string;
  } {
    const membership = this.assertRecord(data, 'data de organizationMembership');
    const organizationRecord = this.isRecord(membership.organization)
      ? membership.organization
      : null;
    const publicUserData = this.isRecord(membership.public_user_data)
      ? membership.public_user_data
      : null;

    return {
      clerkUserId: this.assertString(
        publicUserData?.user_id ?? membership.public_user_id ?? membership.user_id,
        'data.public_user_data.user_id',
      ),
      clerkOrgId: this.assertString(
        organizationRecord?.id ?? membership.organization_id,
        'data.organization.id',
      ),
      role:
        this.normalizeNullableString(membership.role) ??
        this.normalizeNullableString(publicUserData?.role) ??
        undefined,
      email:
        this.normalizeNullableString(publicUserData?.identifier) ??
        this.normalizeNullableString(publicUserData?.email_address) ??
        undefined,
      firstName:
        this.normalizeNullableString(publicUserData?.first_name) ??
        this.normalizeNullableString(publicUserData?.firstName) ??
        undefined,
      lastName:
        this.normalizeNullableString(publicUserData?.last_name) ??
        this.normalizeNullableString(publicUserData?.lastName) ??
        undefined,
      organizationName: this.normalizeNullableString(organizationRecord?.name) ?? undefined,
      organizationSlug: this.normalizeNullableString(organizationRecord?.slug) ?? undefined,
    };
  }

  private extractPrimaryEmail(record: Record<string, unknown>): string | undefined {
    const primaryEmailId = this.normalizeNullableString(record.primary_email_address_id);
    const emailAddresses = record.email_addresses;

    if (!Array.isArray(emailAddresses) || emailAddresses.length === 0) {
      return undefined;
    }

    const normalizedEmails = emailAddresses
      .map((entry) => (this.isRecord(entry) ? entry : null))
      .filter((entry): entry is Record<string, unknown> => entry !== null);

    if (normalizedEmails.length === 0) {
      return undefined;
    }

    if (primaryEmailId !== null) {
      const primary = normalizedEmails.find(
        (entry) => this.normalizeNullableString(entry.id) === primaryEmailId,
      );

      const primaryEmail = this.normalizeNullableString(primary?.email_address);

      if (primaryEmail !== null) {
        return primaryEmail;
      }
    }

    const firstEntry = normalizedEmails[0];

    if (!firstEntry) {
      return undefined;
    }

    const firstEmail = this.normalizeNullableString(firstEntry.email_address);
    return firstEmail ?? undefined;
  }

  private assertRecord(value: unknown, context: string): Record<string, unknown> {
    if (!this.isRecord(value)) {
      throw new BadRequestException(`Payload webhook inválido: ${context}`);
    }

    return value;
  }

  private assertString(value: unknown, field: string): string {
    const normalized = this.normalizeNullableString(value);

    if (normalized === null) {
      throw new BadRequestException(`Payload webhook inválido: falta ${field}`);
    }

    return normalized;
  }

  private normalizeNullableString(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
