import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { VisitRequestsModule } from '../visit-requests/visit-requests.module';
import { InquiriesService } from './inquiries.service';
import { InquiriesController } from './inquiries.controller';

@Module({
  imports: [PrismaModule, VisitRequestsModule],
  controllers: [InquiriesController],
  providers: [InquiriesService],
})
export class InquiriesModule {}
