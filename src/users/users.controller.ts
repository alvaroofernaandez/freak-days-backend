import { Controller, Get } from '@nestjs/common';
import { UsersService, type CurrentUserView } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(): CurrentUserView {
    return this.usersService.getCurrentUser();
  }
}
