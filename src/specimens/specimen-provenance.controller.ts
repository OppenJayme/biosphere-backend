import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateSpecimenProvenanceDto } from './dto/create-specimen-provenance.dto';
import { UpdateSpecimenProvenanceDto } from './dto/update-specimen-provenance.dto';
import { SpecimenProvenance } from './entities/specimen-provenance.entity';
import { SpecimenProvenanceService } from './specimen-provenance.service';

@ApiTags('specimen-provenance')
@Roles('CURATOR')
@Controller('specimens/:specimenId/provenance')
export class SpecimenProvenanceController {
  constructor(private readonly service: SpecimenProvenanceService) {}

  @Post()
  @ApiOperation({ summary: 'Create provenance for an active specimen' })
  @ApiCreatedResponse({ type: SpecimenProvenance })
  @ApiConflictResponse({ description: 'Provenance already exists' })
  create(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Body() dto: CreateSpecimenProvenanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SpecimenProvenance> {
    return this.service.create(specimenId, dto, user.accountId);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve provenance for a specimen' })
  @ApiOkResponse({ type: SpecimenProvenance })
  @ApiNotFoundResponse({ description: 'Specimen or provenance not found' })
  findOne(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
  ): Promise<SpecimenProvenance> {
    return this.service.findOne(specimenId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update provenance for an active specimen' })
  @ApiOkResponse({ type: SpecimenProvenance })
  update(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Body() dto: UpdateSpecimenProvenanceDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SpecimenProvenance> {
    return this.service.update(specimenId, dto, user.accountId);
  }
}
