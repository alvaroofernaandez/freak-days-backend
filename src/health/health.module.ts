import { Module } from '@nestjs/common';

import { AuthHealthController } from './auth-health.controller';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController, AuthHealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
