import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { QuestsNotificationsController } from './quests-notifications.controller';
import { QuestsNotificationsService } from './quests-notifications.service';

@Module({
  imports: [CommonModule],
  controllers: [QuestsNotificationsController],
  providers: [QuestsNotificationsService],
})
export class QuestsNotificationsModule {}
