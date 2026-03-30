import { Module } from '@nestjs/common';

import { IdentityContextService } from './identity/identity-context.service';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [IdentityContextService],
  exports: [PrismaModule, IdentityContextService],
})
export class CommonModule {}
