import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTVerifyOptions,
  type JWTPayload,
} from 'jose';

import type { ClerkJwtPayload } from '../types/clerk-jwt-payload.type';

interface ClerkAuthRuntimeConfig {
  issuerUrl: string;
  jwksUrl: string;
  audience?: string | string[];
}

@Injectable()
export class ClerkJwtStrategy {
  private readonly jwksCache = new Map<
    string,
    ReturnType<typeof createRemoteJWKSet>
  >();

  constructor(private readonly configService: ConfigService) {}

  async validateToken(token: string): Promise<ClerkJwtPayload> {
    const config = this.getRuntimeConfig();

    if (config === null) {
      throw new UnauthorizedException(
        'Autenticación Clerk no configurada para endpoints protegidos',
      );
    }

    const verificationOptions: JWTVerifyOptions = {
      issuer: config.issuerUrl,
    };

    if (config.audience !== undefined) {
      verificationOptions.audience = config.audience;
    }

    try {
      const { payload } = await jwtVerify(
        token,
        this.getOrCreateJwks(config.jwksUrl),
        verificationOptions,
      );

      return this.mapPayload(payload);
    } catch (error: unknown) {
      throw this.mapVerificationError(error);
    }
  }

  private getRuntimeConfig(): ClerkAuthRuntimeConfig | null {
    const issuerUrl = this.getEnvValue('CLERK_ISSUER_URL');
    const jwksUrl = this.getEnvValue('CLERK_JWKS_URL');

    if (issuerUrl === undefined || jwksUrl === undefined) {
      return null;
    }

    const audienceRaw = this.getEnvValue('CLERK_AUDIENCE');
    const audienceList =
      audienceRaw === undefined
        ? []
        : audienceRaw
            .split(',')
            .map((audience) => audience.trim())
            .filter((audience) => audience.length > 0);

    return {
      issuerUrl,
      jwksUrl,
      audience:
        audienceList.length === 0
          ? undefined
          : audienceList.length === 1
            ? audienceList[0]
            : audienceList,
    };
  }

  private getEnvValue(key: string): string | undefined {
    const value = this.configService.get<string>(key);

    if (typeof value !== 'string') {
      return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private getOrCreateJwks(jwksUrl: string): ReturnType<typeof createRemoteJWKSet> {
    const cached = this.jwksCache.get(jwksUrl);

    if (cached !== undefined) {
      return cached;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(jwksUrl);
    } catch {
      throw new UnauthorizedException('CLERK_JWKS_URL no es una URL válida');
    }

    const jwks = createRemoteJWKSet(parsedUrl);
    this.jwksCache.set(jwksUrl, jwks);
    return jwks;
  }

  private mapPayload(payload: JWTPayload): ClerkJwtPayload {
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new UnauthorizedException('JWT sin claim sub');
    }

    return {
      ...payload,
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
      org_id: typeof payload.org_id === 'string' ? payload.org_id : undefined,
      org_role: typeof payload.org_role === 'string' ? payload.org_role : undefined,
    };
  }

  private mapVerificationError(error: unknown): UnauthorizedException {
    if (error instanceof UnauthorizedException) {
      return error;
    }

    if (error instanceof errors.JWTExpired) {
      return new UnauthorizedException('JWT expirado');
    }

    if (error instanceof errors.JWSSignatureVerificationFailed) {
      return new UnauthorizedException('Firma JWT inválida');
    }

    if (error instanceof errors.JWTClaimValidationFailed) {
      return new UnauthorizedException(`Claim JWT inválido: ${error.claim}`);
    }

    if (error instanceof errors.JWTInvalid) {
      return new UnauthorizedException('Token JWT inválido');
    }

    return new UnauthorizedException('No se pudo verificar el JWT de Clerk');
  }
}
