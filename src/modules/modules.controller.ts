import {
  Body,
  Controller,
  Get,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { CurrentOrg } from '../common/decorators/current-org.decorator';
import {
  type SyncUserModulesInput,
  type UserModulePreferenceView,
  ModulesService,
} from './modules.service';

@Controller('v1/modules')
export class ModulesController {
  constructor(private readonly modulesService: ModulesService) {}

  @Get('me')
  getMyModules(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
  ): Promise<UserModulePreferenceView[]> {
    const user = this.getRequestUser(request);

    return this.modulesService.getMyModules(user.sub, orgId);
  }

  @Put('me')
  syncMyModules(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Body() body: SyncUserModulesInput,
  ): Promise<{ modules: UserModulePreferenceView[] }> {
    const user = this.getRequestUser(request);

    return this.modulesService.syncMyModules(user.sub, orgId, body);
  }

  private getRequestUser(request: Request): { sub: string } {
    const sub = request.user?.sub;

    if (!sub) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return { sub };
  }
}
