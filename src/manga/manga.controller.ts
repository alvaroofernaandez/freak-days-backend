import {
  Body,
  Controller,
  Delete,
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
  MangaService,
  type CreateMangaInput,
  type MangaView,
  type UpdateMangaInput,
} from './manga.service';

@Controller('v1/manga')
export class MangaController {
  constructor(private readonly mangaService: MangaService) {}

  @Get()
  listManga(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
  ): Promise<MangaView[]> {
    const user = this.getRequestUser(request);
    return this.mangaService.list(user.sub, orgId);
  }

  @Post()
  createManga(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Body() body: CreateMangaInput,
  ): Promise<MangaView> {
    const user = this.getRequestUser(request);
    return this.mangaService.create(user.sub, orgId, body);
  }

  @Patch(':id')
  updateManga(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
    @Body() body: UpdateMangaInput,
  ): Promise<MangaView> {
    const user = this.getRequestUser(request);
    return this.mangaService.update(user.sub, orgId, id, body);
  }

  @Delete(':id')
  deleteManga(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('id') id: string,
  ): Promise<{ success: true }> {
    const user = this.getRequestUser(request);
    return this.mangaService.remove(user.sub, orgId, id);
  }

  private getRequestUser(request: Request): { sub: string } {
    const sub = request.user?.sub;

    if (!sub) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return { sub };
  }
}
