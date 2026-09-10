// src/storage-locations/storage-locations.controller.ts
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
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { StorageLocationsService } from './storage-locations.service';
import { CreateStorageUnitDto } from './dto/create-storage-unit.dto';
import { UpdateStorageUnitDto } from './dto/update-storage-unit.dto';
import { MoveStorageUnitDto } from './dto/move-storage-unit.dto';
import { StorageMovement } from './entities/storage-movement.entity';
import { StorageUnit } from './entities/storage-unit.entity';

@ApiTags('storage-locations')
@Roles('CURATOR')
@Controller('storage-locations')
export class StorageLocationsController {
  constructor(private readonly service: StorageLocationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a storage unit (curator-only)' })
  @ApiCreatedResponse({ type: StorageUnit })
  create(@Body() dto: CreateStorageUnitDto): Promise<StorageUnit> {
    return this.service.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: [StorageUnit] })
  findAll(): Promise<StorageUnit[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ type: StorageUnit })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<StorageUnit> {
    return this.service.findOne(id);
  }

  @Get(':id/children')
  @ApiOkResponse({ type: [StorageUnit] })
  findChildren(@Param('id', ParseUUIDPipe) id: string): Promise<StorageUnit[]> {
    return this.service.findChildren(id);
  }

  @Get(':id/movements')
  @ApiOkResponse({ type: [StorageMovement] })
  findMovementHistory(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<StorageMovement[]> {
    return this.service.findMovementHistory(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: StorageUnit })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStorageUnitDto,
  ): Promise<StorageUnit> {
    return this.service.update(id, dto);
  }

  @Patch(':id/move')
  @ApiOperation({ summary: 'Reparent a storage unit (REQ-4.6-07/12)' })
  @ApiOkResponse({ type: StorageUnit })
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveStorageUnitDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StorageUnit> {
    return this.service.move(id, dto, user.accountId);
  }

  @Patch(':id/archive')
  @ApiOkResponse({ type: StorageUnit })
  archive(@Param('id', ParseUUIDPipe) id: string): Promise<StorageUnit> {
    return this.service.archive(id);
  }
}
