import { ApiProperty } from '@nestjs/swagger';

export class SpecimenLotSummary {
  @ApiProperty()
  specimenId!: string;

  @ApiProperty({ minimum: 0 })
  activeLotCount!: number;

  @ApiProperty({ minimum: 0 })
  totalQuantity!: number;
}
