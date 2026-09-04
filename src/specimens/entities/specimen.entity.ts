import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum SpecimenStatus {
  UNCATALOGED = 'UNCATALOGED',
  CATALOGED = 'CATALOGED',
  ARCHIVED = 'ARCHIVED',
}

export class SpecimenTaxonomy {
  @ApiPropertyOptional() kingdom?: string;
  @ApiPropertyOptional() phylum?: string;
  @ApiPropertyOptional() class?: string;
  @ApiPropertyOptional() order_name?: string;
  @ApiPropertyOptional() family?: string;
  @ApiPropertyOptional() genus?: string;
  @ApiPropertyOptional() species?: string;
  @ApiPropertyOptional() habitat?: string;
  @ApiPropertyOptional() ecological_role?: string;
  @ApiPropertyOptional() conservation_status?: string;
}

export class SpecimenProvenance {
  @ApiPropertyOptional() collector?: string;
  @ApiPropertyOptional() donor?: string;
  @ApiPropertyOptional() collection_date?: Date;
  @ApiPropertyOptional() collection_location?: string;
  @ApiPropertyOptional() preservation_type?: string;
  @ApiPropertyOptional() preservation_method?: string;
}

export class Specimen {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ description: 'Nullable until assigned/confirmed (REQ-4.4-03)' })
  accession_number?: string | null;

  @ApiPropertyOptional()
  specimen_category?: string;

  @ApiPropertyOptional()
  scientific_name?: string;

  @ApiPropertyOptional()
  common_name?: string;

  @ApiPropertyOptional()
  remarks?: string;

  @ApiProperty({ enum: SpecimenStatus, default: SpecimenStatus.UNCATALOGED })
  status!: SpecimenStatus;

  @ApiProperty({ default: false, description: 'Curator-controlled, does not auto-publish full record (REQ-4.4-16)' })
  public_display_allowed!: boolean;

  @ApiPropertyOptional({ type: SpecimenTaxonomy })
  specimen_taxonomy?: SpecimenTaxonomy;

  @ApiPropertyOptional({ type: SpecimenProvenance })
  specimen_provenance?: SpecimenProvenance;

  @ApiProperty()
  created_by!: string;

  @ApiPropertyOptional()
  updated_by?: string;

  @ApiPropertyOptional()
  archived_by?: string;

  @ApiPropertyOptional()
  archived_at?: Date | null;

  @ApiProperty()
  created_at!: Date;

  @ApiProperty()
  updated_at!: Date;
}