import { Controller, Get } from '@nestjs/common';

import { Public } from '../auth/decorators/public.decorator';
import { HealthService, type AuthHealthStatus } from './health.service';

@Controller('v1/health')
export class AuthHealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get('auth')
  getAuthHealth(): AuthHealthStatus {
    return this.healthService.getAuthStatus();
  }
}
