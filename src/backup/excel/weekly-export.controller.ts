import {
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiGoneResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../../auth/types/auth.types';
import {
  ExportEntry,
  ExportOverview,
  WeeklyExportService,
  XLSX_MIME,
} from './weekly-export.service';

const RUN_RATE_LIMIT = { ttl: 10 * 60 * 1000, limit: 5 } as const;

/**
 * Weekly Excel export (spec 0003). Curators and developers see status;
 * only curators run exports or download files (AC-5).
 */
@ApiTags('backups')
@Controller('backups/exports')
export class WeeklyExportController {
  constructor(private readonly service: WeeklyExportService) {}

  @Get()
  @Roles('CURATOR', 'DEVELOPER')
  @ApiOperation({ summary: 'Weekly Excel export status and recent exports' })
  @ApiOkResponse({ description: 'Schedule, overdue state and recent exports' })
  overview(): Promise<ExportOverview> {
    return this.service.overview();
  }

  @Post('run')
  @Roles('CURATOR')
  @Throttle({ default: RUN_RATE_LIMIT })
  @ApiOperation({ summary: 'Run an Excel export now' })
  @ApiConflictResponse({ description: 'An export is already running' })
  runNow(@CurrentUser() user: AuthenticatedUser): Promise<ExportEntry> {
    return this.service.runNow(user.accountId);
  }

  @Get(':id/file')
  @Roles('CURATOR')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Download an export workbook' })
  @ApiProduces(XLSX_MIME)
  @ApiNotFoundResponse({ description: 'Export not found or has no file' })
  @ApiGoneResponse({ description: 'Removed under the retention policy' })
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.service.readFile(id);
    await this.service.audit('EXPORT_DOWNLOAD_STARTED', id, user.accountId, {
      bytes: file.body.length,
    });
    // "Sent" means the server finished sending; it does not prove the
    // curator's device saved the file (AC-5a).
    let finished = false;
    res.once('finish', () => {
      finished = true;
      void this.service.audit('EXPORT_DOWNLOAD_SENT', id, user.accountId, {
        bytes: file.body.length,
      });
    });
    res.once('close', () => {
      if (!finished) {
        void this.service.audit('EXPORT_DOWNLOAD_ABORTED', id, user.accountId);
      }
    });
    return new StreamableFile(file.body, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${file.fileName}"`,
      length: file.body.length,
    });
  }
}
