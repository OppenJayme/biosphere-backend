/** Protected history reads, a default-off synthetic recorder, and the weekly Excel export (spec 0003). */

import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { WeeklyExportController } from './excel/weekly-export.controller';
import { WeeklyExportService } from './excel/weekly-export.service';
import { RecoveryHistoryService } from './recovery-history.service';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [BackupController, WeeklyExportController],
  providers: [BackupService, RecoveryHistoryService, WeeklyExportService],
  exports: [RecoveryHistoryService],
})
export class BackupModule {}
