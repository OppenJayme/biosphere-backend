import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditService } from './audit.service';
import { ListAuditLogsQueryDto } from './dto/list-audit-logs-query.dto';
import { AuditLogEntry, AuditLogPage } from './entities/audit-log.entity';

@ApiTags('audit-logs')
@Roles('CURATOR')
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly service: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Search and filter protected audit history' })
  @ApiOkResponse({ type: AuditLogPage })
  findAll(@Query() query: ListAuditLogsQueryDto): Promise<AuditLogPage> {
    return this.service.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'View detailed protected audit information' })
  @ApiOkResponse({ type: AuditLogEntry })
  @ApiNotFoundResponse({ description: 'Audit log not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<AuditLogEntry> {
    return this.service.findOne(id);
  }
}
