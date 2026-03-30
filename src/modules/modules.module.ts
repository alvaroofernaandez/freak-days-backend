import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { ModulesController } from './modules.controller';
import { ModulesService } from './modules.service';

@Module({
  imports: [CommonModule],
  controllers: [ModulesController],
  providers: [ModulesService],
})
export class ModulesModule {}
