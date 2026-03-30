import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const migrationsDir = path.resolve(process.cwd(), 'prisma', 'migrations');

if (!existsSync(migrationsDir)) {
  console.error('❌ Falta prisma/migrations. Generá baseline con: pnpm prisma:migrate:dev --name init');
  process.exit(1);
}

const entries = readdirSync(migrationsDir, { withFileTypes: true });

const migrationDirectories = entries
  .filter((entry) => entry.isDirectory())
  .filter((entry) => {
    const sqlPath = path.join(migrationsDir, entry.name, 'migration.sql');
    return existsSync(sqlPath) && statSync(sqlPath).isFile();
  });

if (migrationDirectories.length === 0) {
  console.error('❌ No hay migraciones versionadas en prisma/migrations/.');
  console.error('   Ejecutá: pnpm prisma:migrate:dev --name init');
  process.exit(1);
}

console.log(`✅ Migraciones detectadas: ${migrationDirectories.map((m) => m.name).join(', ')}`);
