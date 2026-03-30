import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { PrismaService } from './common/prisma/prisma.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);

  app.setGlobalPrefix('api');

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  Logger.log(`🚀 FreakDays API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
