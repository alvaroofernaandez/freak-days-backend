import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { CurrentOrg } from '../common/decorators/current-org.decorator';
import {
  CalendarService,
  type CalendarReleaseView,
  type CreateCalendarReleaseInput,
  type UpdateCalendarReleaseInput,
} from './calendar.service';

@Controller('v1/calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('releases')
  listReleases(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
  ): Promise<CalendarReleaseView[]> {
    const user = this.getRequestUser(request);
    return this.calendarService.listReleases(user.sub, orgId);
  }

  @Get('releases/upcoming')
  listUpcomingReleases(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Query('daysAhead') daysAhead?: string,
  ): Promise<CalendarReleaseView[]> {
    const user = this.getRequestUser(request);
    const parsedDaysAhead = this.parseDaysAhead(daysAhead);

    return this.calendarService.listUpcomingReleases(
      user.sub,
      orgId,
      parsedDaysAhead,
    );
  }

  @Post('releases')
  createRelease(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Body() body: CreateCalendarReleaseInput,
  ): Promise<CalendarReleaseView> {
    const user = this.getRequestUser(request);

    return this.calendarService.createRelease(user.sub, orgId, body);
  }

  @Put('releases/:id')
  updateRelease(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
    @Body() body: UpdateCalendarReleaseInput,
  ): Promise<CalendarReleaseView> {
    const user = this.getRequestUser(request);

    return this.calendarService.updateRelease(user.sub, orgId, id, body);
  }

  @Delete('releases/:id')
  deleteRelease(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    const user = this.getRequestUser(request);

    return this.calendarService.deleteRelease(user.sub, orgId, id);
  }

  private parseDaysAhead(daysAhead?: string): number {
    if (!daysAhead || daysAhead.trim().length === 0) {
      return 30;
    }

    const parsed = Number(daysAhead);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 30;
    }

    return Math.min(Math.floor(parsed), 365);
  }

  private getRequestUser(request: Request): { sub: string } {
    const sub = request.user?.sub;

    if (!sub) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return { sub };
  }
}
