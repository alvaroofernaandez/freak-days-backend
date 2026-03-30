import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { PartyListsController } from './party-lists.controller';
import { PartyListsService } from './party-lists.service';

@Module({
  imports: [CommonModule],
  controllers: [PartyListsController],
  providers: [PartyListsService],
})
export class PartyListsModule {}
