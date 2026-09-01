// src/storage-locations/storage-locations.module.ts
import { Module } from '@nestjs/common';
import { StorageLocationsService } from './storage-locations.service';
import { StorageLocationsController } from './storage-locations.controller';

@Module({
  controllers: [StorageLocationsController],
  providers: [StorageLocationsService],
  exports: [StorageLocationsService], // specimen-lots module will need this later
})
export class StorageLocationsModule {}
