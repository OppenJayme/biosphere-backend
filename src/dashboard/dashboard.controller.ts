/** Curator dashboard totals computed in the database (SRS §4.3). */

import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardSummary } from './entities/dashboard-summary.entity';

@ApiTags('dashboard')
@Roles('CURATOR')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Specimen, submission, and exhibit totals plus the short lists the curator dashboard shows',
  })
  @ApiOkResponse({ type: DashboardSummary })
  getSummary(): Promise<DashboardSummary> {
    return this.service.getSummary();
  }
}
