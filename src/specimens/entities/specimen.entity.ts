// src/specimens/entities/specimen.entity.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SpecimenStatus {
  UNCATALOGED = 'UNCATALOGED',
  CATALOGED = 'CATALOGED',
  ARCHIVED = 'ARCHIVED',
}

export class Specimen {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({
    description: 'Nullable until assigned/confirmed (REQ-4.4-03)',
  })
  accessionNumber?: string | null;

  @ApiPropertyOptional()
  scientificName?: string;

  @ApiPropertyOptional()
  commonName?: string;

  @ApiPropertyOptional()
  kingdom?: string;

  @ApiPropertyOptional()
  phylum?: string;

  @ApiPropertyOptional()
  class?: string;

  @ApiPropertyOptional()
  order?: string;

  @ApiPropertyOptional()
  family?: string;

  @ApiPropertyOptional()
  genus?: string;

  @ApiPropertyOptional()
  species?: string;

  @ApiPropertyOptional()
  habitat?: string;

  @ApiPropertyOptional()
  conservationStatus?: string;

  @ApiPropertyOptional()
  ecologicalRole?: string;

  @ApiPropertyOptional()
  collector?: string;

  @ApiPropertyOptional()
  donor?: string;

  @ApiPropertyOptional()
  collectionDate?: string;

  @ApiPropertyOptional()
  collectionLocation?: string;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty({ enum: SpecimenStatus, default: SpecimenStatus.UNCATALOGED })
  status!: SpecimenStatus;

  @ApiProperty({
    default: false,
    description:
      'Curator-controlled, does not auto-publish full record (REQ-4.4-16)',
  })
  publicDisplay!: boolean;

  @ApiPropertyOptional({
    type: [String],
    description:
      'Missing/invalid required fields, shown to curator (REQ-4.4-08)',
  })
  missingFields?: string[];

  @ApiProperty()
  createdBy!: string;

  @ApiProperty()
  updatedBy!: string;

  @ApiPropertyOptional()
  archivedBy?: string;

  @ApiPropertyOptional()
  archivedAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
