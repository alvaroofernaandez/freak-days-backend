import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type WorkoutExercise,
  type WorkoutSession,
  type WorkoutSessionStatus,
  type WorkoutSet,
} from '@prisma/client';

import { IdentityContextService } from '../common/identity/identity-context.service';
import { PrismaService } from '../common/prisma/prisma.service';

type NumberInput = number | string | null | undefined;
type DateInput = string | Date | null | undefined;
type TextInput = string | null | undefined;

interface WorkoutWithRelations extends WorkoutSession {
  exercises: Array<WorkoutExercise & { sets: WorkoutSet[] }>;
}

export interface WorkoutSetView {
  id: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  rest_seconds: number | null;
  duration_seconds: number | null;
  notes: string | null;
}

export interface WorkoutExerciseView {
  id: string;
  exercise_name: string;
  muscle_group: string | null;
  notes: string | null;
  order_index: number;
  workout_sets: WorkoutSetView[];
}

export interface WorkoutSessionView {
  id: string;
  name: string;
  description: string | null;
  workout_date: string;
  duration_minutes: number | null;
  notes: string | null;
  status: WorkoutSessionStatus;
  in_progress: boolean;
  started_at: string | null;
  completed_at: string | null;
  workout_exercises: WorkoutExerciseView[];
}

export interface WeeklyWorkoutStats {
  count: number;
  totalMinutes: number;
}

export interface CreateWorkoutInput {
  name: string;
  description?: TextInput;
  workout_date?: DateInput;
  workoutDate?: DateInput;
  duration_minutes?: NumberInput;
  durationMinutes?: NumberInput;
  notes?: TextInput;
  status?: WorkoutSessionStatus;
}

export interface UpdateWorkoutInput {
  name?: string;
  description?: TextInput;
  workout_date?: DateInput;
  workoutDate?: DateInput;
  duration_minutes?: NumberInput;
  durationMinutes?: NumberInput;
  notes?: TextInput;
  status?: WorkoutSessionStatus;
  started_at?: DateInput;
  startedAt?: DateInput;
  completed_at?: DateInput;
  completedAt?: DateInput;
}

export interface AddWorkoutExerciseInput {
  exercise_name?: string;
  exerciseName?: string;
  muscle_group?: TextInput;
  muscleGroup?: TextInput;
  notes?: TextInput;
}

export interface AddWorkoutSetInput {
  reps?: NumberInput;
  weight_kg?: NumberInput;
  weightKg?: NumberInput;
  rest_seconds?: NumberInput;
  restSeconds?: NumberInput;
  duration_seconds?: NumberInput;
  durationSeconds?: NumberInput;
  notes?: TextInput;
}

export interface UpdateWorkoutSetInput {
  reps?: NumberInput;
  weight_kg?: NumberInput;
  weightKg?: NumberInput;
  rest_seconds?: NumberInput;
  restSeconds?: NumberInput;
  duration_seconds?: NumberInput;
  durationSeconds?: NumberInput;
  notes?: TextInput;
}

@Injectable()
export class WorkoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identityContext: IdentityContextService,
  ) {}

  async list(
    clerkUserId: string,
    orgId: string | null,
    limitInput?: string,
  ): Promise<WorkoutSessionView[]> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );
    const limit = this.normalizeLimit(limitInput);

    const workouts = await this.prisma.workoutSession.findMany({
      where: {
        userId: currentUser.id,
        organizationId: organization.id,
      },
      include: {
        exercises: {
          include: {
            sets: {
              orderBy: {
                setNumber: 'asc',
              },
            },
          },
          orderBy: {
            orderIndex: 'asc',
          },
        },
      },
      orderBy: {
        workoutDate: 'desc',
      },
      take: limit,
    });

    return workouts.map((workout) => this.toWorkoutSessionView(workout));
  }

  async getInProgress(
    clerkUserId: string,
    orgId: string | null,
  ): Promise<WorkoutSessionView | null> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const workout = await this.prisma.workoutSession.findFirst({
      where: {
        userId: currentUser.id,
        organizationId: organization.id,
        status: 'in_progress',
      },
      include: {
        exercises: {
          include: {
            sets: {
              orderBy: {
                setNumber: 'asc',
              },
            },
          },
          orderBy: {
            orderIndex: 'asc',
          },
        },
      },
      orderBy: {
        startedAt: 'desc',
      },
    });

    if (!workout) {
      return null;
    }

    return this.toWorkoutSessionView(workout);
  }

  async getWeeklyStats(
    clerkUserId: string,
    orgId: string | null,
  ): Promise<WeeklyWorkoutStats> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const workouts = await this.prisma.workoutSession.findMany({
      where: {
        userId: currentUser.id,
        organizationId: organization.id,
        workoutDate: {
          gte: weekAgo,
        },
      },
      select: {
        durationMinutes: true,
      },
    });

    return {
      count: workouts.length,
      totalMinutes: workouts.reduce((sum, workout) => sum + (workout.durationMinutes ?? 0), 0),
    };
  }

  async getById(
    clerkUserId: string,
    orgId: string | null,
    id: string,
  ): Promise<WorkoutSessionView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const workout = await this.prisma.workoutSession.findFirst({
      where: {
        id,
        userId: currentUser.id,
        organizationId: organization.id,
      },
      include: {
        exercises: {
          include: {
            sets: {
              orderBy: {
                setNumber: 'asc',
              },
            },
          },
          orderBy: {
            orderIndex: 'asc',
          },
        },
      },
    });

    if (!workout) {
      throw new NotFoundException('Workout no encontrado');
    }

    return this.toWorkoutSessionView(workout);
  }

  async create(
    clerkUserId: string,
    orgId: string | null,
    input: CreateWorkoutInput,
  ): Promise<WorkoutSessionView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const status = this.normalizeWorkoutStatus(input.status, 'in_progress');
    const now = new Date();

    const created = await this.prisma.workoutSession.create({
      data: {
        userId: currentUser.id,
        organizationId: organization.id,
        name: this.normalizeTitle(input.name),
        description: this.normalizeNullableText(input.description),
        workoutDate: this.normalizeWorkoutDate(input.workoutDate ?? input.workout_date),
        durationMinutes: this.normalizeOptionalInteger(
          input.durationMinutes ?? input.duration_minutes,
          'durationMinutes',
        ),
        notes: this.normalizeNullableText(input.notes),
        status,
        startedAt: status === 'in_progress' ? now : null,
        completedAt: status === 'completed' ? now : null,
      },
      include: {
        exercises: {
          include: {
            sets: {
              orderBy: {
                setNumber: 'asc',
              },
            },
          },
          orderBy: {
            orderIndex: 'asc',
          },
        },
      },
    });

    return this.toWorkoutSessionView(created);
  }

  async update(
    clerkUserId: string,
    orgId: string | null,
    id: string,
    input: UpdateWorkoutInput,
  ): Promise<WorkoutSessionView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const existing = await this.prisma.workoutSession.findFirst({
      where: {
        id,
        userId: currentUser.id,
        organizationId: organization.id,
      },
      include: {
        exercises: {
          include: {
            sets: {
              orderBy: {
                setNumber: 'asc',
              },
            },
          },
          orderBy: {
            orderIndex: 'asc',
          },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Workout no encontrado');
    }

    const data: Prisma.WorkoutSessionUpdateInput = {};

    if (Object.prototype.hasOwnProperty.call(input, 'name')) {
      data.name = this.normalizeTitle(input.name ?? '');
    }

    if (Object.prototype.hasOwnProperty.call(input, 'description')) {
      data.description = this.normalizeNullableText(input.description);
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'workoutDate') ||
      Object.prototype.hasOwnProperty.call(input, 'workout_date')
    ) {
      data.workoutDate = this.normalizeWorkoutDate(input.workoutDate ?? input.workout_date);
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'durationMinutes') ||
      Object.prototype.hasOwnProperty.call(input, 'duration_minutes')
    ) {
      data.durationMinutes = this.normalizeOptionalInteger(
        input.durationMinutes ?? input.duration_minutes,
        'durationMinutes',
      );
    }

    if (Object.prototype.hasOwnProperty.call(input, 'notes')) {
      data.notes = this.normalizeNullableText(input.notes);
    }

    if (Object.prototype.hasOwnProperty.call(input, 'status')) {
      const status = this.normalizeWorkoutStatus(input.status, existing.status);
      data.status = status;

      if (status === 'completed') {
        data.completedAt =
          this.normalizeOptionalDate(
            input.completedAt ?? input.completed_at,
            'completedAt',
          ) ?? new Date();
      }

      if (status === 'in_progress') {
        data.startedAt =
          this.normalizeOptionalDate(input.startedAt ?? input.started_at, 'startedAt') ??
          existing.startedAt ??
          new Date();
      }
    }

    if (
      !Object.prototype.hasOwnProperty.call(input, 'status') &&
      (Object.prototype.hasOwnProperty.call(input, 'completedAt') ||
        Object.prototype.hasOwnProperty.call(input, 'completed_at'))
    ) {
      data.completedAt = this.normalizeOptionalDate(
        input.completedAt ?? input.completed_at,
        'completedAt',
      );
    }

    if (
      !Object.prototype.hasOwnProperty.call(input, 'status') &&
      (Object.prototype.hasOwnProperty.call(input, 'startedAt') ||
        Object.prototype.hasOwnProperty.call(input, 'started_at'))
    ) {
      data.startedAt = this.normalizeOptionalDate(input.startedAt ?? input.started_at, 'startedAt');
    }

    if (Object.keys(data).length === 0) {
      return this.toWorkoutSessionView(existing);
    }

    const updated = await this.prisma.workoutSession.update({
      where: {
        id: existing.id,
      },
      data,
      include: {
        exercises: {
          include: {
            sets: {
              orderBy: {
                setNumber: 'asc',
              },
            },
          },
          orderBy: {
            orderIndex: 'asc',
          },
        },
      },
    });

    return this.toWorkoutSessionView(updated);
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

    const deleted = await this.prisma.workoutSession.deleteMany({
      where: {
        id,
        userId: currentUser.id,
        organizationId: organization.id,
      },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('Workout no encontrado');
    }

    return { success: true };
  }

  async addExercise(
    clerkUserId: string,
    orgId: string | null,
    workoutId: string,
    input: AddWorkoutExerciseInput,
  ): Promise<WorkoutExerciseView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const workout = await this.prisma.workoutSession.findFirst({
      where: {
        id: workoutId,
        userId: currentUser.id,
        organizationId: organization.id,
      },
      select: {
        id: true,
      },
    });

    if (!workout) {
      throw new NotFoundException('Workout no encontrado');
    }

    const aggregate = await this.prisma.workoutExercise.aggregate({
      where: {
        workoutSessionId: workout.id,
      },
      _max: {
        orderIndex: true,
      },
    });

    const created = await this.prisma.workoutExercise.create({
      data: {
        workoutSessionId: workout.id,
        userId: currentUser.id,
        organizationId: organization.id,
        exerciseName: this.normalizeExerciseName(input.exerciseName ?? input.exercise_name),
        muscleGroup: this.normalizeNullableText(input.muscleGroup ?? input.muscle_group),
        notes: this.normalizeNullableText(input.notes),
        orderIndex: (aggregate._max.orderIndex ?? -1) + 1,
      },
      include: {
        sets: {
          orderBy: {
            setNumber: 'asc',
          },
        },
      },
    });

    return this.toWorkoutExerciseView(created);
  }

  async addSet(
    clerkUserId: string,
    orgId: string | null,
    exerciseId: string,
    input: AddWorkoutSetInput,
  ): Promise<WorkoutSetView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const exercise = await this.prisma.workoutExercise.findFirst({
      where: {
        id: exerciseId,
        userId: currentUser.id,
        organizationId: organization.id,
      },
      select: {
        id: true,
      },
    });

    if (!exercise) {
      throw new NotFoundException('Ejercicio no encontrado');
    }

    const aggregate = await this.prisma.workoutSet.aggregate({
      where: {
        workoutExerciseId: exercise.id,
      },
      _max: {
        setNumber: true,
      },
    });

    const created = await this.prisma.workoutSet.create({
      data: {
        workoutExerciseId: exercise.id,
        userId: currentUser.id,
        organizationId: organization.id,
        setNumber: (aggregate._max.setNumber ?? 0) + 1,
        reps: this.normalizeOptionalInteger(input.reps, 'reps'),
        weightKg: this.normalizeOptionalNumber(input.weightKg ?? input.weight_kg, 'weightKg'),
        restSeconds: this.normalizeOptionalInteger(
          input.restSeconds ?? input.rest_seconds,
          'restSeconds',
        ),
        durationSeconds: this.normalizeOptionalInteger(
          input.durationSeconds ?? input.duration_seconds,
          'durationSeconds',
        ),
        notes: this.normalizeNullableText(input.notes),
      },
    });

    return this.toWorkoutSetView(created);
  }

  async updateSet(
    clerkUserId: string,
    orgId: string | null,
    setId: string,
    input: UpdateWorkoutSetInput,
  ): Promise<WorkoutSetView> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const existing = await this.prisma.workoutSet.findFirst({
      where: {
        id: setId,
        userId: currentUser.id,
        organizationId: organization.id,
      },
    });

    if (!existing) {
      throw new NotFoundException('Set no encontrado');
    }

    const data: Prisma.WorkoutSetUpdateInput = {};

    if (Object.prototype.hasOwnProperty.call(input, 'reps')) {
      data.reps = this.normalizeOptionalInteger(input.reps, 'reps');
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'weightKg') ||
      Object.prototype.hasOwnProperty.call(input, 'weight_kg')
    ) {
      data.weightKg = this.normalizeOptionalNumber(input.weightKg ?? input.weight_kg, 'weightKg');
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'restSeconds') ||
      Object.prototype.hasOwnProperty.call(input, 'rest_seconds')
    ) {
      data.restSeconds = this.normalizeOptionalInteger(
        input.restSeconds ?? input.rest_seconds,
        'restSeconds',
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(input, 'durationSeconds') ||
      Object.prototype.hasOwnProperty.call(input, 'duration_seconds')
    ) {
      data.durationSeconds = this.normalizeOptionalInteger(
        input.durationSeconds ?? input.duration_seconds,
        'durationSeconds',
      );
    }

    if (Object.prototype.hasOwnProperty.call(input, 'notes')) {
      data.notes = this.normalizeNullableText(input.notes);
    }

    const updated =
      Object.keys(data).length === 0
        ? existing
        : await this.prisma.workoutSet.update({
            where: {
              id: existing.id,
            },
            data,
          });

    return this.toWorkoutSetView(updated);
  }

  async deleteSet(
    clerkUserId: string,
    orgId: string | null,
    setId: string,
  ): Promise<{ success: true }> {
    const { currentUser, organization } = await this.resolveIdentityInOrganization(
      clerkUserId,
      orgId,
    );

    const deleted = await this.prisma.workoutSet.deleteMany({
      where: {
        id: setId,
        userId: currentUser.id,
        organizationId: organization.id,
      },
    });

    if (deleted.count === 0) {
      throw new NotFoundException('Set no encontrado');
    }

    return { success: true };
  }

  private normalizeLimit(value?: string): number {
    if (!value) {
      return 20;
    }

    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new BadRequestException('El parámetro limit debe ser un entero positivo');
    }

    return Math.min(parsed, 100);
  }

  private normalizeTitle(value: string): string {
    const title = typeof value === 'string' ? value.trim() : '';

    if (title.length === 0) {
      throw new BadRequestException('El nombre del entrenamiento es obligatorio');
    }

    if (title.length > 180) {
      throw new BadRequestException(
        'El nombre del entrenamiento no puede superar 180 caracteres',
      );
    }

    return title;
  }

  private normalizeExerciseName(value?: string): string {
    const exerciseName = typeof value === 'string' ? value.trim() : '';

    if (exerciseName.length === 0) {
      throw new BadRequestException('El nombre del ejercicio es obligatorio');
    }

    if (exerciseName.length > 180) {
      throw new BadRequestException('El nombre del ejercicio no puede superar 180 caracteres');
    }

    return exerciseName;
  }

  private normalizeWorkoutStatus(
    value: string | undefined,
    fallback: WorkoutSessionStatus,
  ): WorkoutSessionStatus {
    const normalized = (value ?? '').trim();

    if (normalized.length === 0) {
      return fallback;
    }

    if (normalized === 'in_progress' || normalized === 'completed') {
      return normalized;
    }

    throw new BadRequestException('Estado de workout inválido');
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

  private normalizeOptionalNumber(value: NumberInput, field: string): number | null {
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

    return parsed;
  }

  private normalizeNullableText(value: TextInput): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeWorkoutDate(value: DateInput): Date {
    const parsed = this.normalizeOptionalDate(value, 'workoutDate');

    if (!parsed) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return today;
    }

    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  private normalizeOptionalDate(value: DateInput, field: string): Date | null {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`El campo ${field} tiene un formato inválido`);
    }

    return parsed;
  }

  private toWorkoutSessionView(workout: WorkoutWithRelations): WorkoutSessionView {
    return {
      id: workout.id,
      name: workout.name,
      description: workout.description,
      workout_date: workout.workoutDate.toISOString().split('T')[0] ?? '',
      duration_minutes: workout.durationMinutes,
      notes: workout.notes,
      status: workout.status,
      in_progress: workout.status === 'in_progress',
      started_at: workout.startedAt ? workout.startedAt.toISOString() : null,
      completed_at: workout.completedAt ? workout.completedAt.toISOString() : null,
      workout_exercises: workout.exercises
        .map((exercise) => this.toWorkoutExerciseView(exercise))
        .sort((a, b) => a.order_index - b.order_index),
    };
  }

  private toWorkoutExerciseView(
    exercise: WorkoutExercise & { sets: WorkoutSet[] },
  ): WorkoutExerciseView {
    return {
      id: exercise.id,
      exercise_name: exercise.exerciseName,
      muscle_group: exercise.muscleGroup,
      notes: exercise.notes,
      order_index: exercise.orderIndex,
      workout_sets: exercise.sets
        .map((set) => this.toWorkoutSetView(set))
        .sort((a, b) => a.set_number - b.set_number),
    };
  }

  private toWorkoutSetView(set: WorkoutSet): WorkoutSetView {
    return {
      id: set.id,
      set_number: set.setNumber,
      reps: set.reps,
      weight_kg: set.weightKg,
      rest_seconds: set.restSeconds,
      duration_seconds: set.durationSeconds,
      notes: set.notes,
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
