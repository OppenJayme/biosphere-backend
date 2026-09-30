import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { StorageLocationSummary } from '../../storage-locations/entities/storage-location-path.entity';
import { StorageUnit } from '../../storage-locations/entities/storage-unit.entity';
import { SpecimenLot } from '../../specimen-lots/entities/specimen-lot.entity';
import { MuseumCollection } from './collection.entity';
import { SpecimenMedia } from './specimen-media.entity';
import { SpecimenProvenance } from './specimen-provenance.entity';
import { SpecimenTaxonomy } from './specimen-taxonomy.entity';
import { Specimen } from './specimen.entity';
import { Tag } from './tag.entity';

export class SpecimenDetailLot extends SpecimenLot {
  @ApiProperty({ type: StorageUnit })
  storageUnit!: StorageUnit;

  @ApiProperty({
    type: StorageLocationSummary,
    description: 'Room-to-unit path derived from the storage hierarchy',
  })
  storageLocation!: StorageLocationSummary;
}

export class SpecimenLotOverview {
  @ApiProperty({ minimum: 0 })
  activeLotCount!: number;

  @ApiProperty({ minimum: 0 })
  totalQuantity!: number;
}

export class SpecimenDetail {
  @ApiProperty({ type: Specimen })
  specimen!: Specimen;

  @ApiPropertyOptional({ type: MuseumCollection, nullable: true })
  collection!: MuseumCollection | null;

  @ApiPropertyOptional({ type: SpecimenTaxonomy, nullable: true })
  taxonomy!: SpecimenTaxonomy | null;

  @ApiPropertyOptional({ type: SpecimenProvenance, nullable: true })
  provenance!: SpecimenProvenance | null;

  @ApiProperty({ type: [SpecimenDetailLot] })
  activeLots!: SpecimenDetailLot[];

  @ApiProperty({ type: SpecimenLotOverview })
  lotOverview!: SpecimenLotOverview;

  @ApiProperty({ type: [SpecimenMedia] })
  media!: SpecimenMedia[];

  @ApiProperty({ type: [Tag] })
  tags!: Tag[];
}
