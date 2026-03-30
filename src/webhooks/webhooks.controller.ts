import {
  BadRequestException,
  Controller,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { Public } from '../auth/decorators/public.decorator';
import { WebhooksService } from './webhooks.service';

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Public()
  @Post('clerk')
  @HttpCode(200)
  async handleClerkWebhook(
    @Req() request: RawBodyRequest,
  ): Promise<{ received: true }> {
    const rawBody = request.rawBody;
    const svixId = this.readHeader(request, 'svix-id');
    const svixTimestamp = this.readHeader(request, 'svix-timestamp');
    const svixSignature = this.readHeader(request, 'svix-signature');

    if (!(rawBody instanceof Buffer) || rawBody.length === 0) {
      throw new BadRequestException(
        'Webhook de Clerk sin raw body. Habilitá rawBody en Nest bootstrap.',
      );
    }

    await this.webhooksService.processClerkWebhook(rawBody.toString('utf8'), {
      svixId,
      svixTimestamp,
      svixSignature,
    });

    return { received: true };
  }

  private readHeader(request: Request, headerName: string): string | undefined {
    const value = request.headers[headerName];

    if (typeof value === 'string') {
      return value;
    }

    if (Array.isArray(value)) {
      return value[0];
    }

    return undefined;
  }
}
