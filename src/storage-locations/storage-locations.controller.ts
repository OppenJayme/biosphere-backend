// src/storage-locations/storage-locations.controller.ts
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { Roles } from 'src/auth/decorators/roles.decorator';
import { StorageLocationsService } from './storage-locations.service';
import { CreateStorageUnitDto } from './dto/create-storage-unit.dto';
import { UpdateStorageUnitDto } from './dto/update-storage-unit.dto';
import { MoveStorageUnitDto } from './dto/move-storage-unit.dto';
import { StorageUnit } from './entities/storage-unit.entity';

@ApiTags('storage-locations')
@Roles('curator')
@Controller('storage-locations')
export class StorageLocationsController {
  constructor(private readonly service: StorageLocationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a storage unit (curator-only)' })
  @ApiCreatedResponse({ type: StorageUnit })
  create(@Body() dto: CreateStorageUnitDto): StorageUnit {
    return this.service.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: [StorageUnit] })
  findAll(): StorageUnit[] {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ type: StorageUnit })
  findOne(@Param('id') id: string): StorageUnit {
    return this.service.findOne(id);
  }

  @Get(':id/children')
  @ApiOkResponse({ type: [StorageUnit] })
  findChildren(@Param('id') id: string): StorageUnit[] {
    return this.service.findChildren(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: StorageUnit })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStorageUnitDto,
  ): StorageUnit {
    return this.service.update(id, dto);
  }

  @Patch(':id/move')
  @ApiOperation({ summary: 'Reparent a storage unit (REQ-4.6-07/12)' })
  @ApiOkResponse({ type: StorageUnit })
  move(@Param('id') id: string, @Body() dto: MoveStorageUnitDto): StorageUnit {
    return this.service.move(id, dto.newParentId);
  }

  @Patch(':id/archive')
  @ApiOkResponse({ type: StorageUnit })
  archive(@Param('id') id: string): StorageUnit {
    return this.service.archive(id);
  }
}
