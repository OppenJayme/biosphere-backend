import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SpecimensModule } from '../specimens/specimens.module';
import { OfflineSyncController } from './offline-sync.controller';
import { OfflineSyncService } from './offline-sync.service';

@Module({
  imports: [PrismaModule, SpecimensModule],
  controllers: [OfflineSyncController],
  providers: [OfflineSyncService],
})
export class OfflineSyncModule {}
