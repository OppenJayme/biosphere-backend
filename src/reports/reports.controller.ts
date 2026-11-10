import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { REPORT_GENERATION_RATE_LIMIT } from '../config/rate-limit.config';
import { GenerateReportDto } from './dto/generate-report.dto';
import { ListReportHistoryQueryDto } from './dto/list-report-history-query.dto';
import {
  ReportDefinitionEntity,
  ReportHistoryPage,
  ReportSummary,
} from './entities/report.entity';
import { ReportsService } from './reports.service';

// Reports carry private visitor and internal storage data (REQ-4.7-13), so
// every route is curator-only.
@ApiTags('reports')
@Roles('CURATOR')
@Controller('reports')
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get()
  @ApiOperation({
    summary: 'The five report types with their formats, periods, and filters',
  })
  @ApiOkResponse({ type: [ReportDefinitionEntity] })
  listDefinitions(): ReportDefinitionEntity[] {
    return this.service.listDefinitions();
  }

  @Get('history')
  @ApiOperation({
    summary:
      'Report generation history (successes and failures) from the audit log',
  })
  @ApiOkResponse({ type: ReportHistoryPage })
  listHistory(
    @Query() query: ListReportHistoryQueryDto,
  ): Promise<ReportHistoryPage> {
    return this.service.listHistory(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Report generation totals for the Reports page' })
  @ApiOkResponse({ type: ReportSummary })
  getSummary(): Promise<ReportSummary> {
    return this.service.getSummary();
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: REPORT_GENERATION_RATE_LIMIT })
  @ApiOperation({
    summary:
      'Generate a report file (PDF, DOCX, or CSV); the attempt is recorded in the audit log',
  })
  @ApiProduces(
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/csv',
  )
  @ApiBadRequestResponse({
    description: 'Invalid period, format, or filters for the chosen report',
  })
  @Header('Cache-Control', 'no-store')
  async generate(
    @Body() dto: GenerateReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    const report = await this.service.generate(dto, user);
    return new StreamableFile(report.body, {
      type: report.contentType,
      disposition: `attachment; filename="${report.fileName}"`,
      length: report.body.length,
    });
  }
}
