/** Wires backup history plus scheduled and manual backup execution. */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BackupController } from './backup.controller';
import { BackupRunnerService } from './backup-runner.service';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupService } from './backup.service';

@Module({
  imports: [PrismaModule],
  controllers: [BackupController],
  providers: [BackupService, BackupRunnerService, BackupSchedulerService],
})
export class BackupModule {}
