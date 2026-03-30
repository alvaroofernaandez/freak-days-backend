import { Module } from '@nestjs/common';

import { ClerkJwtGuard } from './guards/clerk-jwt.guard';
import { ClerkJwtStrategy } from './strategies/clerk-jwt.strategy';

@Module({
  providers: [ClerkJwtStrategy, ClerkJwtGuard],
  exports: [ClerkJwtStrategy, ClerkJwtGuard],
})
export class AuthModule {}
