import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SpecimenLot {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  specimenId!: string;

  @ApiProperty()
  storageUnitId!: string;

  @ApiProperty()
  conditionClass!: string;

  @ApiProperty({ minimum: 1 })
  quantity!: number;

  @ApiPropertyOptional({ nullable: true })
  storageNotes!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdBy!: string;

  @ApiPropertyOptional({ nullable: true })
  updatedBy!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
