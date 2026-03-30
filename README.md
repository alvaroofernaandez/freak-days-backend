# freak-days-api

Backend desacoplado de FreakDays sobre **NestJS + Prisma + PostgreSQL**, preparado para el cutover de autenticación a **Clerk** y manejo de multitenancy por organización.

## Stack

- Node.js 20+
- pnpm 9+
- NestJS 10 (TypeScript strict)
- Prisma ORM
- PostgreSQL

## Arranque desde cero (dev local)

Atajo de un comando (recomendado):

```bash
pnpm dev:bootstrap
```

Este comando hace: `docker compose up -d` → espera healthcheck de Postgres → Prisma generate + migrate deploy + check → lint + test → `start:dev`.

Si querés preparar todo sin levantar la API:

```bash
pnpm dev:bootstrap:setup
```

```bash
pnpm install
cp .env.example .env

# 1) Levantar PostgreSQL local
docker compose up -d
docker compose ps

# 2) Preparar Prisma
pnpm prisma:generate
pnpm prisma:migrate:dev --name init
pnpm prisma:migrations:check

# 3) Validaciones mínimas
pnpm lint
pnpm test

# 4) Levantar API
pnpm start:dev
```

Notas:

- `docker-compose.yml` expone PostgreSQL en `localhost:5433` (configurable con `POSTGRES_PORT`) con volumen persistente.
- Variables locales por defecto: `POSTGRES_DB=freak_days`, `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`.
- `DATABASE_URL` debe apuntar a `postgresql://postgres:postgres@localhost:5433/freak_days?schema=public` (o al puerto que definas en `POSTGRES_PORT`).

API base:

- `GET /api/health` (público)
- `GET /api/v1/health/auth` (público, estado de configuración de Clerk)
- `POST /api/v1/webhooks/clerk` (público, provisioning por eventos Clerk)

## Scripts principales

- `pnpm start:dev` — servidor Nest con watch
- `pnpm dev:bootstrap` — bootstrap end-to-end (DB + Prisma + checks + start:dev)
- `pnpm dev:bootstrap:setup` — bootstrap sin iniciar el servidor
- `pnpm build` — build de producción
- `pnpm lint` — lint mínimo (ESLint v9 flat config)
- `pnpm test` — suite Jest (incluye smoke tests)
- `pnpm exec tsc --noEmit` — chequeo de tipos estricto
- `pnpm prisma:generate` — genera Prisma Client
- `pnpm prisma:migrate:dev` — crea/aplica migración local
- `pnpm prisma:migrations:check` — valida que exista al menos una migración versionada
- `pnpm prisma:migrate:deploy` — valida migraciones y luego aplica en entornos no dev
- `pnpm prisma:studio` — UI de inspección de datos

## Quality gates (baseline backend)

Estado mínimo para este baseline:

- ✅ `pnpm lint` (ya no falla por falta de `eslint.config.js`)
- ✅ `pnpm test` (hay smoke test en `test/health.smoke.spec.ts`)
- ✅ `pnpm prisma:migrate:deploy` protegido con `prisma:migrations:check`

Nota de release:

- Si no existe una migración real con `migration.sql` en `prisma/migrations/*`, el deploy queda bloqueado intencionalmente hasta generar baseline con `pnpm prisma:migrate:dev --name init`.

## Arquitectura inicial (scaffold)

```
src/
  auth/             # Validación Clerk JWT por JWKS remoto
  organizations/    # Módulo base de organizaciones
  users/            # Módulo base de usuarios
  health/           # Healthcheck público
  common/           # Guard/interceptor/decorators cross-cutting
  main.ts           # Bootstrap
  app.module.ts     # Wiring global
prisma/
  schema.prisma     # Modelos base multitenant
```

## Multitenancy (base)

Modelos incluidos en Prisma:

- `User`
- `Organization`
- `Membership` con roles `owner | admin | member`
- `AuditLog` (opcional, preparado)

## Autenticación (Clerk JWT)

La estrategia `ClerkJwtStrategy` valida JWTs de Clerk con firma real usando JWKS remoto (`jose`).

- Claims críticos validados: `iss`, `exp` y `aud` (si `CLERK_AUDIENCE` está configurado).
- Configuración requerida para endpoints protegidos: `CLERK_ISSUER_URL` y `CLERK_JWKS_URL`.
- Si faltan esas variables en runtime, los endpoints protegidos responden `401` con error controlado.
- `@Public()` mantiene su comportamiento (no exige JWT).
- Endpoint de observabilidad no sensible: `GET /api/v1/health/auth`.

## Webhooks Clerk (provisioning User/Organization/Membership)

Se agregó un endpoint público para sincronizar identidad base desde Clerk hacia Prisma:

- `POST /api/v1/webhooks/clerk`
- Verificación de firma Svix usando headers `svix-id`, `svix-timestamp`, `svix-signature`.
- Config requerida: `CLERK_WEBHOOK_SECRET`.

Eventos soportados:

- `user.created|updated|deleted`
- `organization.created|updated|deleted`
- `organizationMembership.created|updated|deleted`

Comportamiento clave:

- `deleted` en `User` y `Organization` aplica soft-delete (`isActive=false`).
- Membership hace upsert por `(userId, organizationId)` y borra en `organizationMembership.deleted`.
- El handler es idempotente y crea entidades mínimas faltantes en eventos de membership.

## Modo estricto de identidad y tenant (webhook-provisioned)

Los endpoints protegidos operan en modo estricto: **no existe bootstrap implícito** de `User` ni `Organization` durante requests de runtime.

Reglas:

- `User` debe existir y estar activo (`isActive=true`) por sincronización previa de webhook Clerk.
- `Organization` debe existir y estar activa; se resuelve por `id` interno o `clerkOrgId` (`x-org-id`/claim).
- Para endpoints tenant-aware, se exige `Membership` activa entre user+organization.
- Si falta provisioning o membresía, la API falla con códigos semánticos (`401/403/404/400`) y mensajes explícitos.

Implicancia operativa:

- El endpoint `POST /api/v1/webhooks/clerk` es la **única fuente de creación implícita** de identidad/tenant.
- Si un usuario autenticado en Clerk todavía no fue sincronizado por webhook, los endpoints protegidos devolverán `401` hasta que se complete el provisioning.

## Vertical Profile + Media (R2 signed URLs)

Se incorporó un vertical transicional para perfil de usuario autenticado y uploads de avatar/banner vía signed URL.

### Endpoints Profile

- `GET /api/v1/profile/me`
- `PUT /api/v1/profile/me`
- `POST /api/v1/profile/me/exp`
- `POST /api/v1/profile/me/avatar/upload-url`
- `POST /api/v1/profile/me/banner/upload-url`
- `POST /api/v1/profile/me/avatar/confirm`
- `POST /api/v1/profile/me/banner/confirm`
- `DELETE /api/v1/profile/me/avatar`
- `DELETE /api/v1/profile/me/banner`

### Flujo de upload transicional

1. FE pide signed URL (`.../upload-url`) con metadata del archivo.
2. FE sube directamente con `PUT` a la URL firmada de R2.
3. FE confirma (`.../confirm`) para persistir `avatarKey/avatarUrl` o `bannerKey/bannerUrl`.

### Configuración R2

- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_URL`
- `R2_ENDPOINT` (opcional, para override explícito)

## Próximos hitos sugeridos

1. Definir DTOs y casos de uso en `users` y `organizations`.
2. Incorporar políticas de autorización por tenant/rol.
3. Endurecer validaciones de media (MIME/size) y limpieza de archivos reemplazados.
