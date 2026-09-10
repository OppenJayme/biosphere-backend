import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum LotTransactionType {
  MOVEMENT = 'MOVEMENT',
  CONDITION_CHANGE = 'CONDITION_CHANGE',
  SPLIT = 'SPLIT',
  MERGE = 'MERGE',
  QUANTITY_ADJUSTMENT = 'QUANTITY_ADJUSTMENT',
}

export enum QuantityAdjustmentType {
  ADDITION = 'ADDITION',
  REMOVAL = 'REMOVAL',
  TRANSFER_OUT = 'TRANSFER_OUT',
  DEACCESSION = 'DEACCESSION',
  MISSING_LOSS = 'MISSING_LOSS',
  DESTRUCTION = 'DESTRUCTION',
  DATA_CORRECTION = 'DATA_CORRECTION',
}

export class SpecimenLotTransaction {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  sourceLotId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  targetLotId!: string | null;

  @ApiProperty({ enum: LotTransactionType })
  transactionType!: LotTransactionType;

  @ApiPropertyOptional({ nullable: true, minimum: 1 })
  quantityAffected!: number | null;

  @ApiPropertyOptional({ enum: QuantityAdjustmentType, nullable: true })
  adjustmentType!: QuantityAdjustmentType | null;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiProperty()
  performedBy!: string;

  @ApiProperty()
  createdAt!: Date;
}

export class SpecimenLotTransactionPage {
  @ApiProperty({ type: [SpecimenLotTransaction] })
  items!: SpecimenLotTransaction[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  limit!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}
