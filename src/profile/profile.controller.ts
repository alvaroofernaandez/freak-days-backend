import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  type AddProfileExpInput,
  type ConfirmProfileMediaInput,
  type RequestUploadUrlInput,
  type UpdateProfileInput,
  ProfileService,
} from './profile.service';

@Controller('v1/profile')
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get('me')
  getMyProfile(@Req() request: Request) {
    const user = this.getRequestUser(request);

    return this.profileService.getMyProfile(user.sub);
  }

  @Put('me')
  updateMyProfile(@Req() request: Request, @Body() body: UpdateProfileInput) {
    const user = this.getRequestUser(request);

    return this.profileService.updateMyProfile(user.sub, body);
  }

  @Post('me/exp')
  addExp(@Req() request: Request, @Body() body: AddProfileExpInput) {
    const user = this.getRequestUser(request);

    return this.profileService.addExp(user.sub, body);
  }

  @Post('me/avatar/upload-url')
  requestAvatarUploadUrl(
    @Req() request: Request,
    @Body() body: RequestUploadUrlInput,
  ) {
    const user = this.getRequestUser(request);

    return this.profileService.requestAvatarUploadUrl(user.sub, body);
  }

  @Post('me/banner/upload-url')
  requestBannerUploadUrl(
    @Req() request: Request,
    @Body() body: RequestUploadUrlInput,
  ) {
    const user = this.getRequestUser(request);

    return this.profileService.requestBannerUploadUrl(user.sub, body);
  }

  @Post('me/avatar/confirm')
  confirmAvatarUpload(
    @Req() request: Request,
    @Body() body: ConfirmProfileMediaInput,
  ) {
    const user = this.getRequestUser(request);

    return this.profileService.confirmAvatarUpload(user.sub, body);
  }

  @Post('me/banner/confirm')
  confirmBannerUpload(
    @Req() request: Request,
    @Body() body: ConfirmProfileMediaInput,
  ) {
    const user = this.getRequestUser(request);

    return this.profileService.confirmBannerUpload(user.sub, body);
  }

  @Delete('me/avatar')
  deleteAvatar(@Req() request: Request) {
    const user = this.getRequestUser(request);

    return this.profileService.deleteAvatar(user.sub);
  }

  @Delete('me/banner')
  deleteBanner(@Req() request: Request) {
    const user = this.getRequestUser(request);

    return this.profileService.deleteBanner(user.sub);
  }

  private getRequestUser(request: Request): { sub: string } {
    const sub = request.user?.sub;

    if (!sub) {
      throw new UnauthorizedException('Usuario no autenticado');
    }

    return { sub };
  }
}
