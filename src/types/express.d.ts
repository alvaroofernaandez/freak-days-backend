import type { ClerkJwtPayload } from '../auth/types/clerk-jwt-payload.type';

declare global {
  namespace Express {
    interface Request {
      user?: ClerkJwtPayload;
      orgId?: string;
      requestId?: string;
    }
  }
}

export {};
