import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [CommonModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
