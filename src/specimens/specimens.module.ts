// src/specimens/specimens.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SpecimenProvenanceController } from './specimen-provenance.controller';
import { SpecimenProvenanceService } from './specimen-provenance.service';
import { SpecimenMediaController } from './specimen-media.controller';
import { SpecimenMediaService } from './specimen-media.service';
import { SpecimenTagsController } from './specimen-tags.controller';
import { SpecimenTagsService } from './specimen-tags.service';
import { SpecimenTaxonomyController } from './specimen-taxonomy.controller';
import { SpecimenTaxonomyService } from './specimen-taxonomy.service';
import { SpecimensService } from './specimens.service';
import { SpecimensController } from './specimens.controller';
import { TagsController } from './tags.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    SpecimensController,
    SpecimenTaxonomyController,
    SpecimenProvenanceController,
    SpecimenMediaController,
    SpecimenTagsController,
    TagsController,
  ],
  providers: [
    SpecimensService,
    SpecimenTaxonomyService,
    SpecimenProvenanceService,
    SpecimenMediaService,
    SpecimenTagsService,
  ],
  exports: [
    SpecimensService,
    SpecimenTaxonomyService,
    SpecimenProvenanceService,
    SpecimenMediaService,
    SpecimenTagsService,
  ],
})
export class SpecimensModule {}
