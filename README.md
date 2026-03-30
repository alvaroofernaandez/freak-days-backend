# FreakDays Backend

Decoupled backend for the FreakDays platform, built with NestJS + Prisma + PostgreSQL, with Clerk-based authentication, organization-level multitenancy, and feature modules for anime, manga, quests, workouts, profile, and party collaboration.

## Tech Stack

- Node.js 20+
- pnpm 9+
- NestJS 10 (TypeScript strict mode)
- Prisma ORM
- PostgreSQL 16
- Clerk (JWT + webhooks)
- Cloudflare R2 (signed upload URLs)

## What This API Provides

- JWT authentication through Clerk, validated against remote JWKS.
- Strict webhook-provisioned identity and tenant model (`User`, `Organization`, `Membership`).
- Multi-tenant domain modules under a shared organization context.
- Profile management with avatar/banner direct upload flow using signed URLs.
- Baseline quality gates for linting, tests, and migration safety.

## High-Level Architecture

```
src/
  auth/                    # Clerk JWT strategy + global auth guard
  common/                  # Prisma module, org context guard, request context interceptor
  health/                  # Public health endpoints
  webhooks/                # Clerk webhook ingestion (Svix signature verification)
  organizations/ users/    # Identity and tenant-related modules
  profile/ storage/        # Profile logic + R2 signed URL integration
  anime/ manga/ quests/ workouts/ party/ ...
                           # Product feature modules
  app.module.ts            # Global wiring
  main.ts                  # App bootstrap (/api prefix)
prisma/
  schema.prisma            # Data model and enums
  migrations/              # SQL migrations
scripts/
  bootstrap-dev.mjs        # One-command local bootstrap
```

## Core Data Model

Main entities include:

- `User`, `Profile`
- `Organization`, `Membership` (`owner | admin | member`)
- `AuditLog`
- Domain entities such as `AnimeEntry`, `MangaEntry`, `Quest`, `WorkoutSession`, `Party`, and related child models

The schema is tenant-aware and indexed for common user + organization access patterns.

## Authentication and Tenant Rules

`ClerkJwtStrategy` validates Clerk tokens using `jose` and remote JWKS.

- Required for protected endpoints: `CLERK_ISSUER_URL`, `CLERK_JWKS_URL`
- Optional audience validation: `CLERK_AUDIENCE`
- `@Public()` keeps an endpoint unauthenticated
- Runtime behavior when auth config is missing on protected routes: controlled `401`

### Strict provisioning mode

Protected requests do not auto-create users or organizations.

- `User` must exist and be active in the local DB
- `Organization` must exist and be active
- Tenant-aware endpoints require an active `Membership`
- Missing provisioning/membership returns semantic `401/403/404/400` responses

This means Clerk webhook sync is the source of truth for identity and tenant creation.

## Clerk Webhooks

Public endpoint:

- `POST /api/v1/webhooks/clerk`

Signature verification:

- Svix headers: `svix-id`, `svix-timestamp`, `svix-signature`
- Required secret: `CLERK_WEBHOOK_SECRET`

Supported events:

- `user.created`, `user.updated`, `user.deleted`
- `organization.created`, `organization.updated`, `organization.deleted`
- `organizationMembership.created`, `organizationMembership.updated`, `organizationMembership.deleted`

Behavior highlights:

- `user.deleted` and `organization.deleted` perform soft delete (`isActive=false`)
- Membership is upserted by `(userId, organizationId)`
- Handlers are idempotent and can create minimal missing entities for membership events

## Profile + Media Uploads (R2 Signed URLs)

Profile endpoints:

- `GET /api/v1/profile/me`
- `PUT /api/v1/profile/me`
- `POST /api/v1/profile/me/exp`
- `POST /api/v1/profile/me/avatar/upload-url`
- `POST /api/v1/profile/me/banner/upload-url`
- `POST /api/v1/profile/me/avatar/confirm`
- `POST /api/v1/profile/me/banner/confirm`
- `DELETE /api/v1/profile/me/avatar`
- `DELETE /api/v1/profile/me/banner`

Upload flow:

1. Frontend requests signed URL (`.../upload-url`) with file metadata.
2. Frontend uploads directly to R2 via `PUT`.
3. Frontend confirms upload (`.../confirm`) to persist keys/URLs.

## Public Health Endpoints

- `GET /api/health`
- `GET /api/v1/health/auth`

## Local Development

### Quick start (recommended)

```bash
pnpm dev:bootstrap
```

This command performs: `docker compose up -d` -> waits for PostgreSQL health -> Prisma generate + migration deploy + migration check -> lint + test -> `start:dev`.

### Setup without starting the API

```bash
pnpm dev:bootstrap:setup
```

### Manual setup

```bash
pnpm install
cp .env.example .env

# 1) Start local PostgreSQL
docker compose up -d
docker compose ps

# 2) Prepare Prisma
pnpm prisma:generate
pnpm prisma:migrate:dev --name init
pnpm prisma:migrations:check

# 3) Baseline quality checks
pnpm lint
pnpm test

# 4) Run API
pnpm start:dev
```

`docker-compose.yml` exposes PostgreSQL on `localhost:5433` by default (configurable through `POSTGRES_PORT`) and uses a persistent Docker volume.

## Environment Variables

Minimum required:

- `DATABASE_URL`

Auth-related:

- `CLERK_ISSUER_URL`
- `CLERK_JWKS_URL`
- `CLERK_AUDIENCE` (optional)
- `CLERK_WEBHOOK_SECRET` (required for webhook ingestion)

Storage-related (for media uploads):

- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_URL`
- `R2_ENDPOINT` (optional override)

Runtime:

- `PORT` (defaults to `3000`)

## Scripts

- `pnpm start:dev` - run Nest server in watch mode
- `pnpm dev:bootstrap` - end-to-end local bootstrap + start server
- `pnpm dev:bootstrap:setup` - bootstrap without starting server
- `pnpm build` - production build
- `pnpm lint` - ESLint checks
- `pnpm test` - Jest suite (includes smoke tests)
- `pnpm prisma:generate` - generate Prisma Client
- `pnpm prisma:migrate:dev` - create/apply local migration
- `pnpm prisma:migrations:check` - ensure a versioned migration exists
- `pnpm prisma:migrate:deploy` - guarded migration deploy for non-dev environments
- `pnpm prisma:studio` - inspect DB data via Prisma Studio

## Quality Gates

Expected baseline:

- `pnpm lint` passes
- `pnpm test` passes
- `pnpm prisma:migrate:deploy` is protected by migration existence checks

Release safety note:

If there is no real `migration.sql` inside `prisma/migrations/*`, migration deploy is intentionally blocked until a baseline migration is generated.

## API Prefixing

The app uses a global `/api` prefix. Most feature routes are versioned under `/api/v1`.

## Suggested Next Milestones

1. Expand DTO and use-case boundaries in `users` and `organizations`.
2. Harden tenant/role authorization policies.
3. Strengthen media validation (MIME/size) and file replacement cleanup.
