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
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { CreateSpecimenLotDto } from './dto/create-specimen-lot.dto';
import { ListLotTransactionsQueryDto } from './dto/list-lot-transactions-query.dto';
import { UpdateSpecimenLotNotesDto } from './dto/update-specimen-lot-notes.dto';
import { SpecimenLotTransactionPage } from './entities/specimen-lot-transaction.entity';
import { SpecimenLotSummary } from './entities/specimen-lot-summary.entity';
import { SpecimenLot } from './entities/specimen-lot.entity';
import { SpecimenLotsService } from './specimen-lots.service';

@ApiTags('specimen-lots')
@Roles('CURATOR')
@Controller('specimens/:specimenId/lots')
export class SpecimenLotsController {
  constructor(private readonly service: SpecimenLotsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an initial active specimen lot' })
  @ApiCreatedResponse({ type: SpecimenLot })
  @ApiConflictResponse({ description: 'Matching active lot already exists' })
  create(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Body() dto: CreateSpecimenLotDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SpecimenLot> {
    return this.service.create(specimenId, dto, user.accountId);
  }

  @Get()
  @ApiOperation({ summary: 'List active lots for a specimen' })
  @ApiOkResponse({ type: [SpecimenLot] })
  findActive(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
  ): Promise<SpecimenLot[]> {
    return this.service.findActive(specimenId);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get calculated active lot count and quantity' })
  @ApiOkResponse({ type: SpecimenLotSummary })
  summarize(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
  ): Promise<SpecimenLotSummary> {
    return this.service.summarize(specimenId);
  }

  @Get(':lotId/transactions')
  @ApiOperation({ summary: 'Get paginated transaction history for a lot' })
  @ApiOkResponse({ type: SpecimenLotTransactionPage })
  findTransactions(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Query() query: ListLotTransactionsQueryDto,
  ): Promise<SpecimenLotTransactionPage> {
    return this.service.findTransactions(specimenId, lotId, query);
  }

  @Get(':lotId')
  @ApiOperation({ summary: 'Retrieve a specimen lot, including inactive lots' })
  @ApiOkResponse({ type: SpecimenLot })
  @ApiNotFoundResponse({ description: 'Specimen or lot not found' })
  findOne(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Param('lotId', ParseUUIDPipe) lotId: string,
  ): Promise<SpecimenLot> {
    return this.service.findOne(specimenId, lotId);
  }

  @Patch(':lotId/notes')
  @ApiOperation({ summary: 'Update only the storage notes of an active lot' })
  @ApiOkResponse({ type: SpecimenLot })
  updateNotes(
    @Param('specimenId', ParseUUIDPipe) specimenId: string,
    @Param('lotId', ParseUUIDPipe) lotId: string,
    @Body() dto: UpdateSpecimenLotNotesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SpecimenLot> {
    return this.service.updateNotes(specimenId, lotId, dto, user.accountId);
  }
}
