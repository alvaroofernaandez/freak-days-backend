import { ConfigService } from '@nestjs/config';

import { HealthService } from '../src/health/health.service';

describe('HealthService smoke', () => {
  it('devuelve status ok con shape estable', () => {
    const configService = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    const service = new HealthService(configService);
    const status = service.getStatus();

    expect(status.status).toBe('ok');
    expect(status.service).toBe('freak-days-api');
    expect(typeof status.timestamp).toBe('string');
    expect(typeof status.uptime).toBe('number');
  });
});
