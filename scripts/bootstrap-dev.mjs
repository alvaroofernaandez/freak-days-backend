import { execSync } from 'node:child_process';

function run(command) {
  console.log(`\n▶ ${command}`);
  execSync(command, { stdio: 'inherit' });
}

function waitForPostgres(containerName, attempts = 30, intervalMs = 1000) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const status = execSync(
        `docker inspect --format='{{.State.Health.Status}}' ${containerName}`,
        { stdio: ['ignore', 'pipe', 'ignore'] },
      )
        .toString()
        .trim()
        .replace(/'/g, '');

      if (status === 'healthy') {
        console.log('✅ PostgreSQL healthy');
        return;
      }
    } catch {
      // no-op, container may still be booting
    }

    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, intervalMs);
    process.stdout.write(`⏳ Esperando PostgreSQL... (${attempt}/${attempts})\r`);
  }

  throw new Error(
    `PostgreSQL no llegó a estado healthy tras ${attempts}s. Revisá: docker compose logs postgres`,
  );
}

function main() {
  const noStart = process.argv.includes('--no-start');

  run('docker compose up -d');
  waitForPostgres('freak-days-postgres');

  run('pnpm prisma:generate');
  run('pnpm prisma:migrate:deploy');
  run('pnpm prisma:migrations:check');
  run('pnpm lint');
  run('pnpm test');

  if (noStart) {
    console.log('\n✅ Bootstrap completo (sin levantar API).');
    return;
  }

  run('pnpm start:dev');
}

main();
