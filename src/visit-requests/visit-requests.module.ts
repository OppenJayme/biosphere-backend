import { Module } from '@nestjs/common';
import { VisitRequestsService } from './visit-requests.service';
import { VisitRequestsController } from './visit-requests.controller';

@Module({
  controllers: [VisitRequestsController],
  providers: [VisitRequestsService],
})
export class VisitRequestsModule {}
