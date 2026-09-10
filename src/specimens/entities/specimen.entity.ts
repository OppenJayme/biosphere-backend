import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SpecimenStatus {
  UNCATALOGED = 'UNCATALOGED',
  CATALOGED = 'CATALOGED',
  ARCHIVED = 'ARCHIVED',
}

export enum SpecimenGender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  UNKNOWN = 'UNKNOWN',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

export class Specimen {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ nullable: true })
  collectionId!: string | null;

  @ApiPropertyOptional({
    description: 'Nullable until assigned or confirmed (REQ-4.4-03)',
    nullable: true,
  })
  accessionNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  specimenCategory!: string | null;

  @ApiPropertyOptional({ nullable: true })
  scientificName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  commonName!: string | null;

  @ApiPropertyOptional({ enum: SpecimenGender, nullable: true })
  gender!: SpecimenGender | null;

  @ApiPropertyOptional({ nullable: true })
  classificationStatus!: string | null;

  @ApiProperty({ enum: SpecimenStatus })
  status!: SpecimenStatus;

  @ApiProperty({
    default: false,
    description:
      'Curator-controlled eligibility; it does not publish the full record',
  })
  publicDisplay!: boolean;

  @ApiPropertyOptional({ nullable: true })
  remarks!: string | null;

  @ApiProperty()
  createdBy!: string;

  @ApiPropertyOptional({ nullable: true })
  updatedBy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  archivedBy!: string | null;

  @ApiPropertyOptional({ nullable: true })
  archivedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
