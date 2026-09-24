import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { SpecimenDetail } from './entities/specimen-detail.entity';
import { SpecimenDetailsService } from './specimen-details.service';

@ApiTags('specimens')
@Roles('CURATOR')
@Controller('specimens')
export class SpecimenDetailsController {
  constructor(private readonly service: SpecimenDetailsService) {}

  @Get(':id/details')
  @ApiOperation({
    summary: 'View an integrated curator specimen catalog record',
  })
  @ApiOkResponse({ type: SpecimenDetail })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<SpecimenDetail> {
    return this.service.findOne(id);
  }
}
