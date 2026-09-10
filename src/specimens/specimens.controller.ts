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
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateSpecimenDto } from './dto/create-specimen.dto';
import { SetPublicDisplayDto } from './dto/set-public-display.dto';
import { UpdateSpecimenDto } from './dto/update-specimen.dto';
import { Specimen } from './entities/specimen.entity';
import { SpecimensService } from './specimens.service';

@ApiTags('specimens')
@Roles('CURATOR')
@Controller('specimens')
export class SpecimensController {
  constructor(private readonly service: SpecimensService) {}

  @Post()
  @ApiOperation({ summary: 'Create an Uncataloged specimen record' })
  @ApiCreatedResponse({ type: Specimen })
  create(
    @Body() dto: CreateSpecimenDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Specimen> {
    return this.service.create(dto, user.accountId);
  }

  @Get()
  @ApiOperation({ summary: 'List active specimen records' })
  @ApiOkResponse({ type: [Specimen] })
  findAll(): Promise<Specimen[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ type: Specimen })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Specimen> {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an active specimen core record' })
  @ApiOkResponse({ type: Specimen })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSpecimenDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Specimen> {
    return this.service.update(id, dto, user.accountId);
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
