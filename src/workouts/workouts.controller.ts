import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { CurrentOrg } from '../common/decorators/current-org.decorator';
import {
  type AddWorkoutExerciseInput,
  type AddWorkoutSetInput,
  type CreateWorkoutInput,
  type UpdateWorkoutInput,
  type UpdateWorkoutSetInput,
  type WeeklyWorkoutStats,
  type WorkoutExerciseView,
  type WorkoutSessionView,
  type WorkoutSetView,
  WorkoutsService,
} from './workouts.service';

@Controller('v1/workouts')
export class WorkoutsController {
  constructor(private readonly workoutsService: WorkoutsService) {}

  @Get()
  listWorkouts(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Query('limit') limit?: string,
  ): Promise<WorkoutSessionView[]> {
    const user = this.getRequestUser(request);
    return this.workoutsService.list(user.sub, orgId, limit);
  }

  @Get('in-progress')
  getInProgressWorkout(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
  ): Promise<WorkoutSessionView | null> {
    const user = this.getRequestUser(request);
    return this.workoutsService.getInProgress(user.sub, orgId);
  }

  @Get('weekly-stats')
  getWeeklyStats(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
  ): Promise<WeeklyWorkoutStats> {
    const user = this.getRequestUser(request);
    return this.workoutsService.getWeeklyStats(user.sub, orgId);
  }

  @Get(':id')
  getWorkoutById(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
  ): Promise<WorkoutSessionView> {
    const user = this.getRequestUser(request);
    return this.workoutsService.getById(user.sub, orgId, id);
  }

  @Post()
  createWorkout(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Body() body: CreateWorkoutInput,
  ): Promise<WorkoutSessionView> {
    const user = this.getRequestUser(request);
    return this.workoutsService.create(user.sub, orgId, body);
  }

  @Patch(':id')
  updateWorkout(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
    @Body() body: UpdateWorkoutInput,
  ): Promise<WorkoutSessionView> {
    const user = this.getRequestUser(request);
    return this.workoutsService.update(user.sub, orgId, id, body);
  }

  @Delete(':id')
  deleteWorkout(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    const user = this.getRequestUser(request);
    return this.workoutsService.remove(user.sub, orgId, id);
  }

  @Post(':id/exercises')
  addExercise(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
    @Body() body: AddWorkoutExerciseInput,
  ): Promise<WorkoutExerciseView> {
    const user = this.getRequestUser(request);
    return this.workoutsService.addExercise(user.sub, orgId, id, body);
  }

  @Post('exercises/:id/sets')
  addSet(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
    @Body() body: AddWorkoutSetInput,
  ): Promise<WorkoutSetView> {
    const user = this.getRequestUser(request);
    return this.workoutsService.addSet(user.sub, orgId, id, body);
  }

  @Patch('sets/:id')
  updateSet(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
    @Body() body: UpdateWorkoutSetInput,
  ): Promise<WorkoutSetView> {
    const user = this.getRequestUser(request);
    return this.workoutsService.updateSet(user.sub, orgId, id, body);
  }

  @Delete('sets/:id')
  deleteSet(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    const user = this.getRequestUser(request);
    return this.workoutsService.deleteSet(user.sub, orgId, id);
  }

  private getRequestUser(request: Request): { sub: string } {
    const sub = request.user?.sub;

    if (!sub) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return { sub };
  }
}
