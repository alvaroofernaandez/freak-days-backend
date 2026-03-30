export interface ClerkJwtPayload {
  sub: string;
  email?: string;
  org_id?: string;
  org_role?: string;
  [claim: string]: unknown;
}
