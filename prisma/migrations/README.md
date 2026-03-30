# Prisma migrations baseline

Este proyecto necesita una migración versionada en `prisma/migrations/` antes de permitir deploy con `prisma migrate deploy`.

## Estado actual

- Se creó este directorio para versionar el baseline.
- El script `pnpm prisma:migrations:check` bloquea deploy si no existe al menos una carpeta de migración con `migration.sql`.

## Cómo generar baseline inicial (entorno local)

1. Asegurá `DATABASE_URL` apuntando a una base local de desarrollo.
2. Ejecutá:

   ```bash
   pnpm prisma:migrate:dev --name init
   ```

3. Confirmá que exista una carpeta tipo `prisma/migrations/2026XXXXXX_init/` con `migration.sql`.

## Política de deploy

- `pnpm prisma:migrate:deploy` ahora ejecuta primero `pnpm prisma:migrations:check`.
- Si no hay baseline/migraciones reales, el comando falla con instrucciones para crearlas.
