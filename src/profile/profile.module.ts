import { Module } from '@nestjs/common';

import { CommonModule } from '../common/common.module';
import { StorageModule } from '../storage/storage.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [CommonModule, StorageModule],
  controllers: [ProfileController],
  providers: [ProfileService],
})
export class ProfileModule {}
