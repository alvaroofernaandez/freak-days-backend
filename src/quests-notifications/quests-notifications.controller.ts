import {
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { CurrentOrg } from '../common/decorators/current-org.decorator';
import { QuestsNotificationsService } from './quests-notifications.service';

@Controller('v1/quests/notifications')
export class QuestsNotificationsController {
  constructor(
    private readonly questsNotificationsService: QuestsNotificationsService,
  ) {}

  @Post('overdue/check')
  checkOverdue(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
  ): Promise<{ updatedCount: number }> {
    const user = this.getRequestUser(request);

    return this.questsNotificationsService.checkOverdue(user.sub, orgId);
  }

  @Post('due-soon/check')
  checkDueSoon(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
  ): Promise<{ updatedCount: number }> {
    const user = this.getRequestUser(request);

    return this.questsNotificationsService.checkDueSoon(user.sub, orgId);
  }

  private getRequestUser(request: Request): { sub: string } {
    const sub = request.user?.sub;

    if (!sub) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return { sub };
  }
}
