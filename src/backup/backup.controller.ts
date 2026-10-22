/** Curator-only backup history, policy, and the manual "Back up now" command. */

import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  BACKUP_RETENTION,
  BACKUP_SCHEDULE_HOURS,
  BACKUP_TARGETS,
  BACKUP_TIME_ZONE,
  nextScheduledBackup,
} from './backup-policy';
import { BackupRunnerService, BackupType } from './backup-runner.service';
import { BackupSchedulerService } from './backup-scheduler.service';
import { BackupService } from './backup.service';
import { ListBackupHistoryQueryDto } from './dto/list-backup-history-query.dto';
import {
  BackupHistoryEntry,
  BackupHistoryPage,
} from './entities/backup-history.entity';

@ApiTags('backups')
@Roles('CURATOR')
@Controller('backups')
export class BackupController {
  constructor(
    private readonly service: BackupService,
    private readonly runner: BackupRunnerService,
    private readonly scheduler: BackupSchedulerService,
  ) {}

  @Post('run')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Back up now: snapshot all application tables to private storage and record the run',
  })
  @ApiOkResponse({ type: BackupHistoryEntry })
  @ApiConflictResponse({ description: 'Another backup is already running' })
  runNow(@CurrentUser() user: AuthenticatedUser): Promise<BackupHistoryEntry> {
    return this.runner.run(BackupType.MANUAL, user.accountId);
  }

  @Get('policy')
  @ApiOperation({ summary: 'Backup schedule, retention, and recovery targets' })
  policy() {
    return {
      timeZone: BACKUP_TIME_ZONE,
      scheduleHours: BACKUP_SCHEDULE_HOURS,
      scheduleEnabled: this.scheduler.enabled,
      nextScheduledAt: this.scheduler.enabled
        ? (this.scheduler.nextRunAt ?? nextScheduledBackup(new Date()))
        : null,
      retention: BACKUP_RETENTION,
      targets: BACKUP_TARGETS,
    };
  }

  @Get('history')
  @ApiOperation({ summary: 'Search protected backup execution history' })
  @ApiOkResponse({ type: BackupHistoryPage })
  findAll(
    @Query() query: ListBackupHistoryQueryDto,
  ): Promise<BackupHistoryPage> {
    return this.service.findAll(query);
  }

  @Get('history/:id')
  @ApiOperation({ summary: 'View one protected backup history entry' })
  @ApiOkResponse({ type: BackupHistoryEntry })
  @ApiNotFoundResponse({ description: 'Backup history entry not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<BackupHistoryEntry> {
    return this.service.findOne(id);
  }
}
