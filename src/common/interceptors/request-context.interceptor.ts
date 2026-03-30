import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const requestIdHeader = request.headers['x-request-id'];
    const requestId =
      typeof requestIdHeader === 'string' && requestIdHeader.length > 0
        ? requestIdHeader
        : randomUUID();

    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);

    return next.handle();
  }
}
