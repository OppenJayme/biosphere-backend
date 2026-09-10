// src/storage-locations/storage-locations.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageLocationsService } from './storage-locations.service';
import { StorageLocationsController } from './storage-locations.controller';

@Module({
  imports: [PrismaModule],
  controllers: [StorageLocationsController],
  providers: [StorageLocationsService],
  exports: [StorageLocationsService], // specimen-lots module will need this later
})
export class StorageLocationsModule {}
