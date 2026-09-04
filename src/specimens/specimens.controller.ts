// specimens.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiOkResponse, ApiCreatedResponse } from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from 'src/auth/types/auth.types';
import { SpecimensService } from './specimens.service';
import { CreateSpecimenDto } from './dto/create-specimen.dto';
import { UpdateSpecimenDto } from './dto/update-specimen.dto';
import { ImportSpecimenRowDto } from './dto/import-specimen-row.dto';
import { Specimen } from './entities/specimen.entity';

@ApiTags('specimens')
@Roles('CURATOR')
@Controller('specimens')
export class SpecimensController {
  constructor(private readonly service: SpecimensService) {}

  @Post()
  @ApiOperation({ summary: 'Create a specimen record (curator-only)' })
  @ApiCreatedResponse({ type: Specimen })
  create(@Body() dto: CreateSpecimenDto, @Req() req: AuthenticatedRequest) {
    return this.service.create(dto, req.user!.id);
  }

  @Post('import')
  @ApiOperation({ summary: 'Import specimen rows from spreadsheet/CSV (REQ-4.4-19)' })
  importRows(@Body() rows: ImportSpecimenRowDto[], @Req() req: AuthenticatedRequest) {
    return this.service.importRows(rows, req.user!.id);
  }

  @Get('duplicates/check')
  @ApiOperation({ summary: 'Check possible duplicates before saving (REQ-4.4-21)' })
  @ApiOkResponse({ type: [Specimen] })
  checkDuplicates(@Query() dto: CreateSpecimenDto) {
    return this.service.findPossibleDuplicates(dto);
  }

  @Get()
  @ApiOkResponse({ type: [Specimen] })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ type: Specimen })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: Specimen })
  update(@Param('id') id: string, @Body() dto: UpdateSpecimenDto, @Req() req: AuthenticatedRequest) {
    return this.service.update(id, dto, req.user!.id);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive a specimen instead of deleting (REQ-4.4-10)' })
  @ApiOkResponse({ type: Specimen })
  archive(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.archive(id, req.user!.id);
  }

  @Patch(':id/public-display')
  @ApiOperation({ summary: 'Toggle public-display eligibility (REQ-4.4-15)' })
  @ApiOkResponse({ type: Specimen })
  setPublicDisplay(@Param('id') id: string, @Body('publicDisplay') publicDisplay: boolean) {
    return this.service.setPublicDisplay(id, publicDisplay);
  }
}