/** Curator-only reads of backup execution history; no backup commands live here. */

import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
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
  constructor(private readonly service: BackupService) {}

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
