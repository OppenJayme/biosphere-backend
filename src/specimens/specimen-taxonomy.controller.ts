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
import { CreateSpecimenTaxonomyDto } from './dto/create-specimen-taxonomy.dto';
import { UpdateSpecimenTaxonomyDto } from './dto/update-specimen-taxonomy.dto';
import { SpecimenTaxonomy } from './entities/specimen-taxonomy.entity';
import { SpecimenTaxonomyService } from './specimen-taxonomy.service';

@ApiTags('specimen-taxonomy')
@Roles('CURATOR')
@Controller('specimens/:specimenId/taxonomy')
export class SpecimenTaxonomyController {
  constructor(private readonly service: SpecimenTaxonomyService) {}

  @Post()
  @ApiOperation({ summary: 'Create taxonomy for an active specimen' })
  @ApiCreatedResponse({ type: SpecimenTaxonomy })
  @ApiConflictResponse({ description: 'Taxonomy already exists' })
  create(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Body() dto: CreateSpecimenTaxonomyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SpecimenTaxonomy> {
    return this.service.create(specimenId, dto, user.accountId);
  }

  @Get()
  @ApiOperation({ summary: 'Retrieve taxonomy for a specimen' })
  @ApiOkResponse({ type: SpecimenTaxonomy })
  @ApiNotFoundResponse({ description: 'Specimen or taxonomy not found' })
  findOne(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
  ): Promise<SpecimenTaxonomy> {
    return this.service.findOne(specimenId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update taxonomy for an active specimen' })
  @ApiOkResponse({ type: SpecimenTaxonomy })
  update(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Body() dto: UpdateSpecimenTaxonomyDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SpecimenTaxonomy> {
    return this.service.update(specimenId, dto, user.accountId);
  }
}
