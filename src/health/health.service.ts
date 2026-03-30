import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface HealthStatus {
  status: 'ok';
  service: 'freak-days-api';
  timestamp: string;
  uptime: number;
}

export interface AuthHealthStatus {
  status: 'ok' | 'degraded';
  authProvider: 'clerk';
  checks: {
    issuerConfigured: boolean;
    jwksConfigured: boolean;
    audienceConfigured: boolean;
  };
}

@Injectable()
export class HealthService {
  constructor(private readonly configService: ConfigService) {}

  getStatus(): HealthStatus {
    return {
      status: 'ok',
      service: 'freak-days-api',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  getAuthStatus(): AuthHealthStatus {
    const issuerConfigured = this.hasConfigValue('CLERK_ISSUER_URL');
    const jwksConfigured = this.hasConfigValue('CLERK_JWKS_URL');
    const audienceConfigured = this.hasConfigValue('CLERK_AUDIENCE');

    return {
      status: issuerConfigured && jwksConfigured ? 'ok' : 'degraded',
      authProvider: 'clerk',
      checks: {
        issuerConfigured,
        jwksConfigured,
        audienceConfigured,
      },
    };
  }

  private hasConfigValue(key: string): boolean {
    const rawValue = this.configService.get<string>(key);
    return typeof rawValue === 'string' && rawValue.trim().length > 0;
  }
}
