import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VisitRequestsService } from './visit-requests.service';
import { VisitRequestsController } from './visit-requests.controller';

@Module({
  imports: [PrismaModule],
  controllers: [VisitRequestsController],
  providers: [VisitRequestsService],
})
export class VisitRequestsModule {}
