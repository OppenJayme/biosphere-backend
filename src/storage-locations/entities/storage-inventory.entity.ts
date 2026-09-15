import { ApiProperty } from '@nestjs/swagger';
import { SpecimenLot } from '../../specimen-lots/entities/specimen-lot.entity';
import { Specimen } from '../../specimens/entities/specimen.entity';
import { StorageUnit } from './storage-unit.entity';

export class StorageInventoryItem {
  @ApiProperty({ type: SpecimenLot })
  lot!: SpecimenLot;

  @ApiProperty({ type: Specimen })
  specimen!: Specimen;
}

export class StorageInventoryPage {
  @ApiProperty({ type: StorageUnit })
  storageUnit!: StorageUnit;

  @ApiProperty({ type: [StorageInventoryItem] })
  items!: StorageInventoryItem[];

  @ApiProperty({ minimum: 0 })
  totalLots!: number;

  @ApiProperty({ minimum: 0 })
  totalQuantity!: number;

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  limit!: number;
}
