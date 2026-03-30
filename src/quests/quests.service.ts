import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Prisma,
  Quest,
  QuestDifficulty,
  QuestNotification,
  QuestNotificationType,
} from '@prisma/client';

import { IdentityContextService } from '../common/identity/identity-context.service';
import { PrismaService } from '../common/prisma/prisma.service';

type NumberInput = number | string | null | undefined;
type DateInput = string | Date | null | undefined;
type TextInput = string | null | undefined;

export interface QuestView {
  id: string;
  title: string;
  description: string | null;
  difficulty: QuestDifficulty;
  expReward: number;
  dueDate: Date | null;
  dueTime: string | null;
  reminderMinutesBefore: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestNotificationView {
  id: string;
  quest_id: string;
  notification_type: QuestNotificationType;
  message: string;
  sent_at: Date;
  read_at: Date | null;
}

export interface CreateQuestInput {
  title: string;
  description?: TextInput;
  difficulty?: QuestDifficulty;
  expReward?: NumberInput;
  exp_reward?: NumberInput;
  isRecurring?: boolean;
  is_recurring?: boolean;
  recurrencePattern?: TextInput;
  recurrence_pattern?: TextInput;
  dueDate?: DateInput;
  due_date?: DateInput;
  dueTime?: TextInput;
  due_time?: TextInput;
  reminderMinutesBefore?: NumberInput;
  reminder_minutes_before?: NumberInput;
}

export interface UpdateQuestInput {
  title?: string;
  description?: TextInput;
  difficulty?: QuestDifficulty;
  expReward?: NumberInput;
  exp_reward?: NumberInput;
  isRecurring?: boolean;
  is_recurring?: boolean;
  recurrencePattern?: TextInput;
  recurrence_pattern?: TextInput;
  dueDate?: DateInput;
  due_date?: DateInput;
  dueTime?: TextInput;
  due_time?: TextInput;
  reminderMinutesBefore?: NumberInput;
  reminder_minutes_before?: NumberInput;
  active?: boolean;
}

export interface CompleteQuestInput {
  streakCount?: NumberInput;
  streak_count?: NumberInput;
}

@Injectable()
export class QuestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
  ) {}

  async list(clerkUserId: string, orgId: string | null): Promise<QuestView[]> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const quests = await this.prisma.quest.findMany({
      where: {
        userId: currentUser.id,
        organizationId: organization.id,
        active: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return quests.map((quest) => this.toQuestView(quest));
  }

  async create(
    clerkUserId: string,
    orgId: string | null,
    input: CreateQuestInput,
  ): Promise<QuestView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const created = await this.prisma.quest.create({
      data: {
        userId: currentUser.id,
        organizationId: organization.id,
        title: this.normalizeTitle(input.title),
        description: this.normalizeNullableText(input.description),
        difficulty: this.normalizeDifficulty(input.difficulty, 'medium'),
        expReward: this.normalizeInteger(input.expReward ?? input.exp_reward, 'expReward', 0),
        isRecurring: this.normalizeBoolean(input.isRecurring ?? input.is_recurring, false),
        recurrencePattern: this.normalizeNullableText(
          input.recurrencePattern ?? input.recurrence_pattern,
        ),
        dueDate: this.normalizeOptionalDate(input.dueDate ?? input.due_date, 'dueDate'),
        dueTime: this.normalizeOptionalDueTime(input.dueTime ?? input.due_time),
        reminderMinutesBefore: this.normalizeOptionalInteger(
          input.reminderMinutesBefore ?? input.reminder_minutes_before,
          'reminderMinutesBefore',
        ),
        active: true,
      },
    });

    return this.toQuestView(created);
  }

  async update(
    clerkUserId: string,
    orgId: string | null,
    id: string,
    input: UpdateQuestInput,
  ): Promise<{ success: true; quest: QuestView }> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const existing = await this.prisma.quest.findFirst({
      where: {
        id,
        userId: currentUser.id,
        organizationId: organization.id,
      },
    });

    if (!existing) {
      throw new NotFoundException('Quest no encontrada');
    }

    const data: Prisma.QuestUpdateInput = {};

    if (Object.prototype.hasOwnProperty.call(input, 'title')) {
      data.title = this.normalizeTitle(input.title ?? '');
    }

    if (Object.prototype.hasOwnProperty.call(input, 'description')) {
      data.description = this.normalizeNullableText(input.description);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'difficulty')) {
      data.difficulty = this.normalizeDifficulty(input.difficulty, existing.difficulty);
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'expReward') ||
      Object.prototype.hasOwnProperty.call(input, 'exp_reward')
    ) {
      data.expReward = this.normalizeInteger(
        input.expReward ?? input.exp_reward,
        'expReward',
        existing.expReward,
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'isRecurring') ||
      Object.prototype.hasOwnProperty.call(input, 'is_recurring')
    ) {
      data.isRecurring = this.normalizeBoolean(
        input.isRecurring ?? input.is_recurring,
        existing.isRecurring,
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'recurrencePattern') ||
      Object.prototype.hasOwnProperty.call(input, 'recurrence_pattern')
    ) {
      data.recurrencePattern = this.normalizeNullableText(
        input.recurrencePattern ?? input.recurrence_pattern,
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'dueDate') ||
      Object.prototype.hasOwnProperty.call(input, 'due_date')
    ) {
      data.dueDate = this.normalizeOptionalDate(
        input.dueDate ?? input.due_date,
        'dueDate',
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'dueTime') ||
      Object.prototype.hasOwnProperty.call(input, 'due_time')
    ) {
      data.dueTime = this.normalizeOptionalDueTime(input.dueTime ?? input.due_time);
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'reminderMinutesBefore') ||
      Object.prototype.hasOwnProperty.call(input, 'reminder_minutes_before')
    ) {
      data.reminderMinutesBefore = this.normalizeOptionalInteger(
        input.reminderMinutesBefore ?? input.reminder_minutes_before,
        'reminderMinutesBefore',
      );
    }

    if (Object.prototype.hasOwnProperty.call(input, 'active')) {
      data.active = this.normalizeBoolean(input.active, existing.active);
    }

    const updated =
      Object.keys(data).length === 0
        ? existing
        : await this.prisma.quest.update({
            where: {
              id: existing.id,
            },
            data,
          });

    return {
      success: true,
      quest: this.toQuestView(updated),
    };
  }

  async complete(
    clerkUserId: string,
    orgId: string | null,
    id: string,
    input?: CompleteQuestInput,
  ): Promise<{ expEarned: number }> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const quest = await this.prisma.quest.findFirst({
      where: {
        id,
        userId: currentUser.id,
        organizationId: organization.id,
        active: true,
      },
    });

    if (!quest) {
      throw new NotFoundException('Quest no encontrada');
    }

    const expEarned = quest.expReward;
    const streakCount = this.normalizeInteger(
      input?.streakCount ?? input?.streak_count,
      'streakCount',
      1,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.questCompletion.create({
        data: {
          questId: quest.id,
          userId: currentUser.id,
          organizationId: organization.id,
          expEarned,
          streakCount,
        },
      });

      const profile = await tx.profile.findUnique({
        where: {
          userId: currentUser.id,
        },
        select: {
          id: true,
        },
      });

      if (profile) {
        await tx.profile.update({
          where: {
            id: profile.id,
          },
          data: {
            totalExp: {
              increment: expEarned,
            },
          },
        });
      }
    });

    return { expEarned };
  }

  async listTodayCompletions(
    clerkUserId: string,
    orgId: string | null,
  ): Promise<string[]> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const completions = await this.prisma.questCompletion.findMany({
      where: {
        userId: currentUser.id,
        organizationId: organization.id,
        completedAt: {
          gte: startOfToday,
        },
      },
      select: {
        questId: true,
      },
    });

    return completions.map((completion) => completion.questId);
  }

  async listNotifications(
    clerkUserId: string,
    orgId: string | null,
  ): Promise<QuestNotificationView[]> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const notifications = await this.prisma.questNotification.findMany({
      where: {
        userId: currentUser.id,
        organizationId: organization.id,
      },
      orderBy: {
        sentAt: 'desc',
      },
      take: 50,
    });

    return notifications.map((notification) => this.toQuestNotificationView(notification));
  }

  async markNotificationRead(
    clerkUserId: string,
    orgId: string | null,
    id: string,
  ): Promise<{ success: true }> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const updated = await this.prisma.questNotification.updateMany({
      where: {
        id,
        userId: currentUser.id,
        organizationId: organization.id,
      },
      data: {
        readAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new NotFoundException('Notificación no encontrada');
    }

    return {
      success: true,
    };
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

  private normalizeDifficulty(
    value: string | undefined,
    fallback: QuestDifficulty,
  ): QuestDifficulty {
    const normalized = (value ?? '').trim();

    if (normalized.length === 0) {
      return fallback;
    }

    if (
      normalized === 'easy' ||
      normalized === 'medium' ||
      normalized === 'hard' ||
      normalized === 'legendary'
    ) {
      return normalized;
    }

    throw new BadRequestException('Dificultad de quest inválida');
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

  private normalizeNullableText(value: TextInput): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeOptionalDate(value: DateInput, field: string): Date | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`El campo ${field} tiene un formato inválido`);
    }

    return parsed;
  }

  private normalizeOptionalDueTime(value: TextInput): string | null {
    const normalized = this.normalizeNullableText(value);

    if (!normalized) {
      return null;
    }

    if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(normalized)) {
      throw new BadRequestException('El campo dueTime debe tener formato HH:mm o HH:mm:ss');
    }

    return normalized.length === 5 ? `${normalized}:00` : normalized;
  }

  private normalizeBoolean(value: boolean | undefined, fallback: boolean): boolean {
    if (typeof value === 'boolean') {
      return value;
    }

    if (value === undefined) {
      return fallback;
    }

    throw new BadRequestException('Valor booleano inválido');
  }

  private toQuestView(quest: Quest): QuestView {
    return {
      id: quest.id,
      title: quest.title,
      description: quest.description,
      difficulty: quest.difficulty,
      expReward: quest.expReward,
      dueDate: quest.dueDate,
      dueTime: quest.dueTime,
      reminderMinutesBefore: quest.reminderMinutesBefore,
      createdAt: quest.createdAt,
      updatedAt: quest.updatedAt,
    };
  }

  private toQuestNotificationView(notification: QuestNotification): QuestNotificationView {
    return {
      id: notification.id,
      quest_id: notification.questId,
      notification_type: notification.notificationType,
      message: notification.message,
      sent_at: notification.sentAt,
      read_at: notification.readAt,
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
