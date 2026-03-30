import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { CurrentOrg } from '../common/decorators/current-org.decorator';
import {
  PartyListsService,
  type CreatePartyListInput,
  type CreatePartyListItemInput,
  type PartyListDetailView,
  type PartyListSummaryView,
  type PartyListItemView,
  type UpdatePartyListInput,
} from './party-lists.service';

@Controller('v1/party')
export class PartyListsController {
  constructor(private readonly partyListsService: PartyListsService) {}

  @Get(':partyId/lists')
  listByParty(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('partyId') partyId: string,
  ): Promise<PartyListSummaryView[]> {
    const user = this.getRequestUser(request);

    return this.partyListsService.listByParty(user.sub, orgId, partyId);
  }

  @Post(':partyId/lists')
  createList(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('partyId') partyId: string,
    @Body() body: CreatePartyListInput,
  ): Promise<PartyListSummaryView> {
    const user = this.getRequestUser(request);

    return this.partyListsService.createList(user.sub, orgId, partyId, body);
  }

  @Get('lists/:listId')
  getListById(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('listId') listId: string,
  ): Promise<PartyListDetailView> {
    const user = this.getRequestUser(request);

    return this.partyListsService.getListById(user.sub, orgId, listId);
  }

  @Put('lists/:listId')
  updateList(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('listId') listId: string,
    @Body() body: UpdatePartyListInput,
  ): Promise<PartyListDetailView> {
    const user = this.getRequestUser(request);

    return this.partyListsService.updateList(user.sub, orgId, listId, body);
  }

  @Post('lists/:listId/items')
  addListItem(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('listId') listId: string,
    @Body() body: CreatePartyListItemInput,
  ): Promise<PartyListItemView> {
    const user = this.getRequestUser(request);

    return this.partyListsService.addListItem(user.sub, orgId, listId, body);
  }

  @Delete('lists/:listId/items/:itemId')
  removeListItem(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('listId') listId: string,
    @Param('itemId') itemId: string,
  ): Promise<{ success: true }> {
    const user = this.getRequestUser(request);

    return this.partyListsService.removeListItem(user.sub, orgId, listId, itemId);
  }

  private getRequestUser(request: Request): { sub: string } {
    const sub = request.user?.sub;

    if (!sub) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return { sub };
  }
}
