/** Protected history reads and a default-off internal synthetic recorder; no write API. */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { RecoveryHistoryService } from './recovery-history.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [BackupController],
  providers: [BackupService, RecoveryHistoryService],
  exports: [RecoveryHistoryService],
})
export class BackupModule {}
