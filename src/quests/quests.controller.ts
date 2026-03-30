import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { CurrentOrg } from '../common/decorators/current-org.decorator';
import {
  type CompleteQuestInput,
  type CreateQuestInput,
  type QuestNotificationView,
  type QuestView,
  QuestsService,
  type UpdateQuestInput,
} from './quests.service';

@Controller('v1/quests')
export class QuestsController {
  constructor(private readonly questsService: QuestsService) {}

  @Get()
  listQuests(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
  ): Promise<QuestView[]> {
    const user = this.getRequestUser(request);
    return this.questsService.list(user.sub, orgId);
  }

  @Post()
  createQuest(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Body() body: CreateQuestInput,
  ): Promise<QuestView> {
    const user = this.getRequestUser(request);
    return this.questsService.create(user.sub, orgId, body);
  }

  @Patch(':id')
  updateQuest(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
    @Body() body: UpdateQuestInput,
  ): Promise<{ success: true; quest: QuestView }> {
    const user = this.getRequestUser(request);
    return this.questsService.update(user.sub, orgId, id, body);
  }

  @Post(':id/complete')
  completeQuest(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
    @Body() body: CompleteQuestInput,
  ): Promise<{ expEarned: number }> {
    const user = this.getRequestUser(request);
    return this.questsService.complete(user.sub, orgId, id, body);
  }

  @Get('completions')
  listTodayCompletions(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
  ): Promise<string[]> {
    const user = this.getRequestUser(request);
    return this.questsService.listTodayCompletions(user.sub, orgId);
  }

  @Get('notifications')
  listNotifications(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
  ): Promise<QuestNotificationView[]> {
    const user = this.getRequestUser(request);
    return this.questsService.listNotifications(user.sub, orgId);
  }

  @Patch('notifications/:id')
  markNotificationRead(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    const user = this.getRequestUser(request);
    return this.questsService.markNotificationRead(user.sub, orgId, id);
  }

  private getRequestUser(request: Request): { sub: string } {
    const sub = request.user?.sub;

    if (!sub) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return { sub };
  }
}
