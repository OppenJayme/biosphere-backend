import { ApiProperty } from '@nestjs/swagger';
import { StorageCapacityWarning } from '../../storage-locations/entities/storage-capacity.entity';
import {
  LotTransactionType,
  SpecimenLotTransaction,
} from './specimen-lot-transaction.entity';
import { SpecimenLot } from './specimen-lot.entity';

export class SpecimenLotOperationResult {
  @ApiProperty({
    enum: [LotTransactionType.MOVEMENT, LotTransactionType.CONDITION_CHANGE],
  })
  operation!: LotTransactionType.MOVEMENT | LotTransactionType.CONDITION_CHANGE;

  @ApiProperty({ type: SpecimenLot })
  sourceLot!: SpecimenLot;

  @ApiProperty({ type: SpecimenLot })
  targetLot!: SpecimenLot;

  @ApiProperty({ type: SpecimenLotTransaction })
  transaction!: SpecimenLotTransaction;

  @ApiProperty({
    description: 'True when the complete source quantity was transferred',
  })
  sourceDeactivated!: boolean;

  @ApiProperty({
    description: 'True when quantity was added to an existing matching lot',
  })
  mergedIntoExistingTarget!: boolean;

  @ApiProperty({
    type: StorageCapacityWarning,
    nullable: true,
    description:
      'Present when the receiving storage unit now exceeds its configured capacity; the change is still applied',
  })
  capacityWarning!: StorageCapacityWarning | null;
}
