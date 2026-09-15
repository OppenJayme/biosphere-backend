import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SpecimenRevisionActor {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: ['CURATOR', 'DEVELOPER'] })
  role!: 'CURATOR' | 'DEVELOPER';
}

export class SpecimenRevision {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  specimenId!: string;

  @ApiProperty({ type: SpecimenRevisionActor })
  changedBy!: SpecimenRevisionActor;

  @ApiProperty()
  fieldChanged!: string;

  @ApiPropertyOptional({ nullable: true })
  oldValue!: string | null;

  @ApiPropertyOptional({ nullable: true })
  newValue!: string | null;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;

  @ApiProperty()
  sourceSection!: string;

  @ApiProperty({ format: 'date-time' })
  changedAt!: Date;
}

export class SpecimenRevisionPage {
  @ApiProperty({ type: [SpecimenRevision] })
  items!: SpecimenRevision[];

  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  limit!: number;
}
