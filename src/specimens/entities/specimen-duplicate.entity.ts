import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Specimen, SpecimenStatus } from './specimen.entity';

export enum DuplicateMatchField {
  ACCESSION_NUMBER = 'ACCESSION_NUMBER',
  SCIENTIFIC_NAME = 'SCIENTIFIC_NAME',
  COMMON_NAME = 'COMMON_NAME',
  COLLECTOR = 'COLLECTOR',
  DONOR = 'DONOR',
  COLLECTION_LOCATION = 'COLLECTION_LOCATION',
  COLLECTION_DATE = 'COLLECTION_DATE',
}

export enum DuplicateConfidence {
  /** Same accession number, or same species plus a matching collector, donor, location, or date. */
  HIGH = 'HIGH',
  /** Same scientific and common name, with no provenance to tell them apart. */
  MEDIUM = 'MEDIUM',
}

export class PossibleDuplicate {
  @ApiProperty({ description: 'The existing specimen that may be a duplicate' })
  specimenId!: string;

  @ApiPropertyOptional({ nullable: true })
  accessionNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  scientificName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  commonName!: string | null;

  @ApiProperty({ enum: SpecimenStatus })
  status!: SpecimenStatus;

  @ApiProperty({ enum: DuplicateConfidence })
  confidence!: DuplicateConfidence;

  @ApiProperty({
    enum: DuplicateMatchField,
    isArray: true,
    description: 'Fields whose values match the checked record',
  })
  matchedFields!: DuplicateMatchField[];

  @ApiProperty({
    enum: DuplicateMatchField,
    isArray: true,
    description:
      'Fields filled on both records whose values differ, shown for context. A differing collector or donor (BR-09) suppresses name-based warnings, so those two only appear here on accession-number matches.',
  })
  differingFields!: DuplicateMatchField[];

  @ApiProperty({ description: 'Human-readable warning for the curator' })
  message!: string;
}

export class SpecimenDuplicateCheckResult {
  @ApiProperty({ type: [PossibleDuplicate] })
  possibleDuplicates!: PossibleDuplicate[];

  @ApiProperty({
    description:
      'False when the duplicate lookup could not run; possibleDuplicates is then empty and does not mean "no duplicates".',
  })
  duplicateCheckAvailable!: boolean;
}

export class SpecimenCreateResult extends Specimen {
  @ApiProperty({
    type: [PossibleDuplicate],
    description:
      'Warning only (REQ-4.4-21/22): the record was saved regardless; the curator decides whether to edit or archive either record',
  })
  possibleDuplicates!: PossibleDuplicate[];

  @ApiProperty({
    description:
      'False when the post-save duplicate lookup failed. The record was still created, so do not resubmit; re-check with GET /specimens/:id/possible-duplicates.',
  })
  duplicateCheckAvailable!: boolean;
}
