// src/storage-locations/storage-locations.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageLocationsService } from './storage-locations.service';
import { StorageLocationsController } from './storage-locations.controller';
import { StorageInventoryController } from './storage-inventory.controller';
import { StorageInventoryService } from './storage-inventory.service';

@Module({
  imports: [PrismaModule],
  controllers: [StorageInventoryController, StorageLocationsController],
  providers: [StorageInventoryService, StorageLocationsService],
  exports: [StorageInventoryService, StorageLocationsService],
})
export class StorageLocationsModule {}
