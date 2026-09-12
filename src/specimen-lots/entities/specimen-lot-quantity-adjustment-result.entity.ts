import { ApiProperty } from '@nestjs/swagger';
import {
  QuantityAdjustmentType,
  SpecimenLotTransaction,
} from './specimen-lot-transaction.entity';
import { SpecimenLot } from './specimen-lot.entity';

export class SpecimenLotQuantityAdjustmentResult {
  @ApiProperty({ enum: QuantityAdjustmentType })
  adjustmentType!: QuantityAdjustmentType;

  @ApiProperty({ description: 'Signed change applied to active inventory' })
  quantityDelta!: number;

  @ApiProperty({ minimum: 1 })
  previousQuantity!: number;

  @ApiProperty({ minimum: 0 })
  resultingQuantity!: number;

  @ApiProperty({ type: SpecimenLot })
  lot!: SpecimenLot;

  @ApiProperty({ type: SpecimenLotTransaction })
  transaction!: SpecimenLotTransaction;

  @ApiProperty({
    description: 'True when the adjustment reduced the active quantity to zero',
  })
  lotDeactivated!: boolean;
}
