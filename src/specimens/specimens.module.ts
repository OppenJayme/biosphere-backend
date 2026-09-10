// src/specimens/specimens.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SpecimenTaxonomyController } from './specimen-taxonomy.controller';
import { SpecimenTaxonomyService } from './specimen-taxonomy.service';
import { SpecimensService } from './specimens.service';
import { SpecimensController } from './specimens.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SpecimensController, SpecimenTaxonomyController],
  providers: [SpecimensService, SpecimenTaxonomyService],
  exports: [SpecimensService, SpecimenTaxonomyService],
})
export class SpecimensModule {}
