import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { AnimeController } from './anime.controller';
import { AnimeService } from './anime.service';

@Module({
  imports: [CommonModule],
  controllers: [AnimeController],
  providers: [AnimeService],
})
export class AnimeModule {}
