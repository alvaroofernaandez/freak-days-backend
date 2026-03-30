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
  AnimeService,
  type AnimeStatus,
  type AnimeView,
  type CreateAnimeInput,
  type UpdateAnimeInput,
} from './anime.service';

@Controller('v1/anime')
export class AnimeController {
  constructor(private readonly animeService: AnimeService) {}

  @Get()
  listAnime(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Query('status') status?: AnimeStatus,
  ): Promise<AnimeView[]> {
    const user = this.getRequestUser(request);
    return this.animeService.list(user.sub, orgId, status);
  }

  @Post()
  createAnime(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Body() body: CreateAnimeInput,
  ): Promise<AnimeView> {
    const user = this.getRequestUser(request);
    return this.animeService.create(user.sub, orgId, body);
  }

  @Patch(':id')
  updateAnime(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
    @Body() body: UpdateAnimeInput,
  ): Promise<AnimeView> {
    const user = this.getRequestUser(request);
    return this.animeService.update(user.sub, orgId, id, body);
  }

  @Delete(':id')
  deleteAnime(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    const user = this.getRequestUser(request);
    return this.animeService.remove(user.sub, orgId, id);
  }

  private getRequestUser(request: Request): { sub: string } {
    const sub = request.user?.sub;

    if (!sub) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return { sub };
  }
}
