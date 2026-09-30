import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CheckAccessionNumberQueryDto } from './dto/check-accession-number.dto';
import { CreateSpecimenDto } from './dto/create-specimen.dto';
import { ListSpecimenRevisionsQueryDto } from './dto/list-specimen-revisions-query.dto';
import { ReopenCatalogingDto } from './dto/reopen-cataloging.dto';
import { SearchSpecimensQueryDto } from './dto/search-specimens-query.dto';
import { SetPublicDisplayDto } from './dto/set-public-display.dto';
import { UpdateSpecimenDto } from './dto/update-specimen.dto';
import { AccessionNumberAvailability } from './entities/accession-number.entity';
import { CatalogReadiness } from './entities/catalog-readiness.entity';
import { SpecimenCreateResult } from './entities/specimen-duplicate.entity';
import { SpecimenRevisionPage } from './entities/specimen-revision.entity';
import { Specimen, SpecimenPage } from './entities/specimen.entity';
import { SpecimenAccessionService } from './specimen-accession.service';
import { SpecimenCatalogingService } from './specimen-cataloging.service';
import { SpecimenDuplicatesService } from './specimen-duplicates.service';
import { SpecimensService } from './specimens.service';

@ApiTags('specimens')
@Roles('CURATOR')
@Controller('specimens')
export class SpecimensController {
  constructor(
    private readonly service: SpecimensService,
    private readonly duplicates: SpecimenDuplicatesService,
    private readonly catalogingService: SpecimenCatalogingService,
    private readonly accession: SpecimenAccessionService,
  ) {}

  @Post()
  @ApiOperation({
    summary:
      'Create an Uncataloged specimen record, warning on possible duplicates (REQ-4.4-21)',
  })
  @ApiCreatedResponse({ type: SpecimenCreateResult })
  @ApiConflictResponse({
    description: 'ACCESSION_NUMBER_TAKEN: the accession number is in use',
  })
  async create(
    @Body() dto: CreateSpecimenDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SpecimenCreateResult> {
    const specimen = await this.service.create(dto, user.accountId);
    // Runs after the commit and never blocks or fails the create
    // (REQ-4.4-22); clients that want to warn before saving call
    // POST /specimens/duplicate-check first.
    const duplicateCheck = await this.duplicates.findAfterCreate(
      specimen,
      specimen.id,
    );
    return { ...specimen, ...duplicateCheck };
  }

  @Get()
  @ApiOperation({ summary: 'List active specimen records' })
  @ApiOkResponse({ type: [Specimen] })
  findAll(): Promise<Specimen[]> {
    return this.service.findAll();
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search, filter, sort, and paginate the curator specimen catalog',
  })
  @ApiOkResponse({ type: SpecimenPage })
  search(@Query() query: SearchSpecimensQueryDto): Promise<SpecimenPage> {
    return this.service.search(query);
  }

  @Get('accession-number-availability')
  @ApiOperation({
    summary:
      'Check whether an accession number is free to assign (REQ-4.4-04, BR-01)',
    description:
      'Numbers are compared trimmed and case-insensitively against every specimen record, Archived ones included. Create and update enforce the same rule and return 409 ACCESSION_NUMBER_TAKEN on a conflict.',
  })
  @ApiOkResponse({ type: AccessionNumberAvailability })
  checkAccessionNumber(
    @Query() query: CheckAccessionNumberQueryDto,
  ): Promise<AccessionNumberAvailability> {
    return this.accession.checkAvailability(
      query.accessionNumber,
      query.excludeSpecimenId,
    );
  }

  @Get(':id/revisions')
  @ApiOperation({ summary: "View a specimen's protected revision history" })
  @ApiOkResponse({ type: SpecimenRevisionPage })
  findRevisionHistory(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListSpecimenRevisionsQueryDto,
  ): Promise<SpecimenRevisionPage> {
    return this.service.findRevisionHistory(id, query);
  }

  @Get(':id/catalog-readiness')
  @ApiOperation({
    summary: 'Explain whether an Uncataloged specimen is ready to catalog',
  })
  @ApiOkResponse({ type: CatalogReadiness })
  getCatalogReadiness(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CatalogReadiness> {
    return this.catalogingService.getReadiness(id);
  }

  @Get(':id')
  @ApiOkResponse({ type: Specimen })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Specimen> {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an active specimen core record' })
  @ApiOkResponse({ type: Specimen })
  @ApiConflictResponse({
    description: 'ACCESSION_NUMBER_TAKEN: the accession number is in use',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSpecimenDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Specimen> {
    return this.service.update(id, dto, user.accountId);
  }

  @Patch(':id/complete-cataloging')
  @ApiOperation({
    summary: 'Validate and promote an Uncataloged specimen to Cataloged',
  })
  @ApiOkResponse({ type: Specimen })
  completeCataloging(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Specimen> {
    return this.service.completeCataloging(id, user.accountId);
  }

  @Patch(':id/reopen-cataloging')
  @ApiOperation({
    summary: 'Return a Cataloged specimen to Uncataloged for correction',
  })
  @ApiOkResponse({ type: Specimen })
  reopenCataloging(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenCatalogingDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Specimen> {
    return this.service.reopenCataloging(id, dto, user.accountId);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive a specimen instead of deleting it' })
  @ApiOkResponse({ type: Specimen })
  archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Specimen> {
    return this.service.archive(id, user.accountId);
  }

  @Patch(':id/public-display')
  @ApiOperation({ summary: 'Change Cataloged specimen public eligibility' })
  @ApiOkResponse({ type: Specimen })
  setPublicDisplay(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetPublicDisplayDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Specimen> {
    return this.service.setPublicDisplay(id, dto, user.accountId);
  }
}
