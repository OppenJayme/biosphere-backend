import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SpecimenStatus } from './specimen.entity';

/** The existing record that already holds an accession number. */
export class AccessionNumberHolder {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: 'The value as stored on the existing record' })
  accessionNumber!: string;

  @ApiPropertyOptional({ nullable: true })
  scientificName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  commonName!: string | null;

  @ApiProperty({
    enum: SpecimenStatus,
    description:
      'Archived records keep their accession number, so they still block reuse',
  })
  status!: SpecimenStatus;
}

export class AccessionNumberAvailability {
  @ApiProperty({ description: 'The checked value, trimmed' })
  accessionNumber!: string;

  @ApiProperty()
  available!: boolean;

  @ApiPropertyOptional({ type: AccessionNumberHolder, nullable: true })
  conflictingSpecimen!: AccessionNumberHolder | null;
}
