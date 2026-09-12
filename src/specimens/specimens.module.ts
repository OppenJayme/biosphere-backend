// src/specimens/specimens.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SpecimenProvenanceController } from './specimen-provenance.controller';
import { SpecimenProvenanceService } from './specimen-provenance.service';
import { SpecimenMediaController } from './specimen-media.controller';
import { SpecimenMediaService } from './specimen-media.service';
import { SpecimenTaxonomyController } from './specimen-taxonomy.controller';
import { SpecimenTaxonomyService } from './specimen-taxonomy.service';
import { SpecimensService } from './specimens.service';
import { SpecimensController } from './specimens.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    SpecimensController,
    SpecimenTaxonomyController,
    SpecimenProvenanceController,
    SpecimenMediaController,
  ],
  providers: [
    SpecimensService,
    SpecimenTaxonomyService,
    SpecimenProvenanceService,
    SpecimenMediaService,
  ],
  exports: [
    SpecimensService,
    SpecimenTaxonomyService,
    SpecimenProvenanceService,
    SpecimenMediaService,
  ],
})
export class SpecimensModule {}
