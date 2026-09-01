// src/specimens/specimens.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/roles.decorator';
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

  // TODO: replace 'current-curator-id' with req.user.id once this route
  // sits behind SupabaseAuthGuard's populated req.user (see roles.guard.ts)
  @Post()
  @ApiOperation({ summary: 'Create a specimen record (curator-only)' })
  @ApiCreatedResponse({ type: Specimen })
  create(@Body() dto: CreateSpecimenDto): Specimen {
    return this.service.create(dto, 'current-curator-id');
  }

  @Post('import')
  @ApiOperation({
    summary: 'Import specimen rows from spreadsheet/CSV (REQ-4.4-19)',
  })
  importRows(@Body() rows: ImportSpecimenRowDto[]) {
    return this.service.importRows(rows, 'current-curator-id');
  }

  @Get('duplicates/check')
  @ApiOperation({
    summary: 'Check possible duplicates before saving (REQ-4.4-21)',
  })
  @ApiOkResponse({ type: [Specimen] })
  checkDuplicates(@Query() dto: CreateSpecimenDto): Specimen[] {
    return this.service.findPossibleDuplicates(dto);
  }

  @Get()
  @ApiOkResponse({ type: [Specimen] })
  findAll(): Specimen[] {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ type: Specimen })
  findOne(@Param('id') id: string): Specimen {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: Specimen })
  update(@Param('id') id: string, @Body() dto: UpdateSpecimenDto): Specimen {
    return this.service.update(id, dto, 'current-curator-id');
  }

  @Patch(':id/archive')
  @ApiOperation({
    summary: 'Archive a specimen instead of deleting (REQ-4.4-10)',
  })
  @ApiOkResponse({ type: Specimen })
  archive(@Param('id') id: string): Specimen {
    return this.service.archive(id, 'current-curator-id');
  }

  @Patch(':id/public-display')
  @ApiOperation({ summary: 'Toggle public-display eligibility (REQ-4.4-15)' })
  @ApiOkResponse({ type: Specimen })
  setPublicDisplay(
    @Param('id') id: string,
    @Body('publicDisplay') publicDisplay: boolean,
  ): Specimen {
    return this.service.setPublicDisplay(id, publicDisplay);
  }
}
