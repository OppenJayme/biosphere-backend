import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SpecimenProvenance {
  @ApiProperty()
  specimenId!: string;

  @ApiPropertyOptional({ nullable: true })
  collector!: string | null;

  @ApiPropertyOptional({ nullable: true })
  donor!: string | null;

  @ApiPropertyOptional({
    description: 'Calendar date in YYYY-MM-DD format',
    example: '2026-09-10',
    nullable: true,
  })
  collectionDate!: string | null;

  @ApiPropertyOptional({ nullable: true })
  collectionLocation!: string | null;

  @ApiPropertyOptional({ nullable: true })
  preservationType!: string | null;

  @ApiPropertyOptional({ nullable: true })
  preservationMethod!: string | null;

  @ApiProperty()
  updatedAt!: Date;
}
