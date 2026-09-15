import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SpecimenLotsController } from './specimen-lots.controller';
import { SpecimenLotsService } from './specimen-lots.service';

@Module({
  imports: [PrismaModule],
  controllers: [SpecimenLotsController],
  providers: [SpecimenLotsService],
  exports: [SpecimenLotsService],
})
export class SpecimenLotsModule {}
