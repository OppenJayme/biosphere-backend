import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CheckSpecimenDuplicatesDto } from './dto/check-specimen-duplicates.dto';
import { SpecimenDuplicateCheckResult } from './entities/specimen-duplicate.entity';
import { SpecimenDuplicatesService } from './specimen-duplicates.service';

@ApiTags('specimens')
@Roles('CURATOR')
@Controller('specimens')
export class SpecimenDuplicatesController {
  constructor(private readonly service: SpecimenDuplicatesService) {}

  // POST rather than GET so specimen details stay out of URLs and logs.
  @Post('duplicate-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Check unsaved specimen values for possible duplicates without saving anything (REQ-4.4-21)',
  })
  @ApiOkResponse({ type: SpecimenDuplicateCheckResult })
  async check(
    @Body() dto: CheckSpecimenDuplicatesDto,
  ): Promise<SpecimenDuplicateCheckResult> {
    const { excludeSpecimenId, ...candidate } = dto;
    return {
      possibleDuplicates: await this.service.findForCandidate(
        candidate,
        excludeSpecimenId ? [excludeSpecimenId] : [],
      ),
      duplicateCheckAvailable: true,
    };
  }

  @Get(':id/possible-duplicates')
  @ApiOperation({
    summary:
      'List possible duplicates of a saved specimen, including its provenance (REQ-4.4-21)',
  })
  @ApiOkResponse({ type: SpecimenDuplicateCheckResult })
  async findForSpecimen(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SpecimenDuplicateCheckResult> {
    return {
      possibleDuplicates: await this.service.findForSpecimen(id),
      duplicateCheckAvailable: true,
    };
  }
}
