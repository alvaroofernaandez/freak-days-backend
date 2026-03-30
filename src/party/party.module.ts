import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { PartyController } from './party.controller';
import { PartyService } from './party.service';

@Module({
  imports: [CommonModule],
  controllers: [PartyController],
  providers: [PartyService],
  exports: [PartyService],
})
export class PartyModule {}
