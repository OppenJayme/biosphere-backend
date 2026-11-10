import { ApiProperty } from '@nestjs/swagger';

/**
 * Non-blocking notice that a storage unit now holds more specimens than its
 * optional configured capacity (REQ-4.6-11). The assignment still succeeds.
 */
export class StorageCapacityWarning {
  @ApiProperty()
  storageUnitId!: string;

  @ApiProperty()
  storageUnitLabel!: string;

  @ApiProperty({ minimum: 0 })
  capacity!: number;

  @ApiProperty({
    description: 'Active specimen-lot quantity in the unit after the change',
  })
  occupiedQuantity!: number;

  @ApiProperty({ minimum: 1 })
  exceededBy!: number;
}

export class StorageCapacityCheck {
  @ApiProperty()
  storageUnitId!: string;

  @ApiProperty()
  storageUnitLabel!: string;

  @ApiProperty({ nullable: true, type: Number })
  capacity!: number | null;

  @ApiProperty({
    description: 'Active specimen-lot quantity currently in the unit',
  })
  occupiedQuantity!: number;

  @ApiProperty({ minimum: 0 })
  additionalQuantity!: number;

  @ApiProperty({ description: 'occupiedQuantity + additionalQuantity' })
  projectedQuantity!: number;

  @ApiProperty({
    description:
      'True when the projected quantity would exceed a configured capacity',
  })
  exceedsCapacity!: boolean;
}
