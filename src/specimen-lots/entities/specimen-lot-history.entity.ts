import { ApiProperty } from '@nestjs/swagger';
import { SpecimenLotTransaction } from './specimen-lot-transaction.entity';

/**
 * A lot transaction with the before/after location and condition resolved
 * from its source and target lots (REQ-4.5-11, REQ-4.6-09).
 */
export class SpecimenLotHistoryEntry extends SpecimenLotTransaction {
  @ApiProperty({ nullable: true, type: String })
  specimenId!: string | null;

  @ApiProperty({ description: 'Full name of the acting curator' })
  performedByName!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Storage unit quantity left; null for additions',
  })
  fromStorageUnitId!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Storage unit quantity went to; null for removals',
  })
  toStorageUnitId!: string | null;

  @ApiProperty({ nullable: true, type: String })
  fromConditionClass!: string | null;

  @ApiProperty({ nullable: true, type: String })
  toConditionClass!: string | null;
}

export class SpecimenLotHistoryPage {
  @ApiProperty({ type: [SpecimenLotHistoryEntry] })
  items!: SpecimenLotHistoryEntry[];

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  limit!: number;

  @ApiProperty({ minimum: 0 })
  total!: number;
}
