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
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { SpecimenDetailsController } from './specimen-details.controller';
import { SpecimenDetailsService } from './specimen-details.service';
import { SpecimenImportController } from './specimen-import.controller';
import { SpecimenImportService } from './specimen-import.service';
import { SpecimenDuplicatesController } from './specimen-duplicates.controller';
import { SpecimenDuplicatesService } from './specimen-duplicates.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    SpecimenDetailsController,
    SpecimensController,
    SpecimenImportController,
    SpecimenDuplicatesController,
    SpecimenTaxonomyController,
    SpecimenProvenanceController,
    SpecimenMediaController,
    SpecimenTagsController,
    TagsController,
    CollectionsController,
  ],
  providers: [
    SpecimenDetailsService,
    SpecimensService,
    SpecimenImportService,
    SpecimenDuplicatesService,
    SpecimenTaxonomyService,
    SpecimenProvenanceService,
    SpecimenMediaService,
    SpecimenTagsService,
    CollectionsService,
  ],
  exports: [
    SpecimenDetailsService,
    SpecimensService,
    SpecimenImportService,
    SpecimenDuplicatesService,
    SpecimenTaxonomyService,
    SpecimenProvenanceService,
    SpecimenMediaService,
    SpecimenTagsService,
    CollectionsService,
  ],
})
export class SpecimensModule {}
