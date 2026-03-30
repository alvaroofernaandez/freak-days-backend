import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import { CurrentOrg } from '../common/decorators/current-org.decorator';
import {
  PartyService,
  type CreatePartyInput,
  type JoinPartyInput,
  type PartyView,
} from './party.service';

@Controller('v1/party')
export class PartyController {
  constructor(private readonly partyService: PartyService) {}

  @Get()
  listMyParties(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
  ): Promise<PartyView[]> {
    const user = this.getRequestUser(request);

    return this.partyService.listForCurrentUser(user.sub, orgId);
  }

  @Post()
  createParty(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Body() body: CreatePartyInput,
  ): Promise<PartyView> {
    const user = this.getRequestUser(request);

    return this.partyService.createParty(user.sub, orgId, body);
  }

  @Post('join')
  joinByCode(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Body() body: JoinPartyInput,
  ): Promise<PartyView> {
    const user = this.getRequestUser(request);

    return this.partyService.joinByCode(user.sub, orgId, body);
  }

  @Post(':partyId/leave')
  leaveParty(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('partyId') partyId: string,
  ): Promise<{ success: true }> {
    const user = this.getRequestUser(request);

    return this.partyService.leaveParty(user.sub, orgId, partyId);
  }

  @Post(':partyId/regenerate-invite-code')
  regenerateInviteCode(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('partyId') partyId: string,
  ): Promise<{ inviteCode: string }> {
    const user = this.getRequestUser(request);

    return this.partyService.regenerateInviteCode(
      user.sub,
      orgId,
      partyId,
    );
  }

  @Delete(':partyId')
  deleteParty(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('partyId') partyId: string,
  ): Promise<{ success: true }> {
    const user = this.getRequestUser(request);

    return this.partyService.deleteParty(user.sub, orgId, partyId);
  }

  @Delete(':partyId/members/:memberUserId')
  removeMember(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('partyId') partyId: string,
    @Param('memberUserId') memberUserId: string,
  ): Promise<{ success: true }> {
    const user = this.getRequestUser(request);

    return this.partyService.removeMember(
      user.sub,
      orgId,
      partyId,
      memberUserId,
    );
  }

  @Get(':partyId')
  getPartyById(
    @Req() request: Request,
    @CurrentOrg() orgId: string | null,
    @Param('partyId') partyId: string,
  ): Promise<PartyView> {
    const user = this.getRequestUser(request);

    return this.partyService.getPartyById(user.sub, orgId, partyId);
  }

  private getRequestUser(request: Request): { sub: string } {
    const sub = request.user?.sub;

    if (!sub) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return { sub };
  }
}
