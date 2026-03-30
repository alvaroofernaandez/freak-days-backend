import { Injectable } from '@nestjs/common';

export interface CurrentUserView {
  clerkUserId: string;
  email: string | null;
  orgId: string | null;
}

@Injectable()
export class UsersService {
  getCurrentUser(): CurrentUserView {
    return {
      clerkUserId: 'placeholder',
      email: null,
      orgId: null,
    };
  }
}
