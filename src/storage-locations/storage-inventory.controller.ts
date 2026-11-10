import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListLotHistoryQueryDto } from '../specimen-lots/dto/list-lot-history-query.dto';
import { SpecimenLotHistoryPage } from '../specimen-lots/entities/specimen-lot-history.entity';
import { ListStorageInventoryQueryDto } from './dto/list-storage-inventory-query.dto';
import { StorageInventoryPage } from './entities/storage-inventory.entity';
import { StorageInventoryService } from './storage-inventory.service';

@ApiTags('storage-locations')
@Roles('CURATOR')
@Controller('storage-locations')
export class StorageInventoryController {
  constructor(private readonly service: StorageInventoryService) {}

  @Get(':id/inventory')
  @ApiOperation({
    summary: 'List active specimen lots assigned directly to a storage unit',
  })
  @ApiOkResponse({ type: StorageInventoryPage })
  findForStorageUnit(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListStorageInventoryQueryDto,
  ): Promise<StorageInventoryPage> {
    return this.service.findForStorageUnit(id, query);
  }

  @Get(':id/lot-movements')
  @ApiOperation({
    summary:
      'Get paginated specimen-lot movements and changes involving a storage unit',
  })
  @ApiOkResponse({ type: SpecimenLotHistoryPage })
  findLotMovements(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListLotHistoryQueryDto,
  ): Promise<SpecimenLotHistoryPage> {
    return this.service.findLotMovements(id, query);
  }
}
