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

export class SpecimenSearchStorageUnit {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  unitType!: string;
}

/** Catalog row with the columns the curator specimen table displays. */
export class SpecimenSearchItem extends Specimen {
  @ApiProperty({ nullable: true, type: String })
  family!: string | null;

  @ApiProperty({ nullable: true, type: String })
  collector!: string | null;

  @ApiProperty({ description: 'Sum of active lot quantities' })
  totalQuantity!: number;

  @ApiProperty({
    type: [String],
    description: 'Distinct condition classes of the active lots',
  })
  conditionClasses!: string[];

  @ApiProperty({
    type: [SpecimenSearchStorageUnit],
    description: 'Distinct storage units holding the active lots',
  })
  storageUnits!: SpecimenSearchStorageUnit[];
}

export class SpecimenPage {
  @ApiProperty({ type: [SpecimenSearchItem] })
  items!: SpecimenSearchItem[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
