import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { QuestsController } from './quests.controller';
import { QuestsService } from './quests.service';

@Module({
  imports: [CommonModule],
  controllers: [QuestsController],
  providers: [QuestsService],
})
export class QuestsModule {}
