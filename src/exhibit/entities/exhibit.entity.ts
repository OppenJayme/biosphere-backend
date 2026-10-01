import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PUBLIC_SPECIMEN_FIELDS,
  REQUIRED_EXHIBIT_CONTENT,
  type PublicSpecimenField,
} from '../exhibit-public-fields';
import { ExhibitMedia, PublicExhibitMedia } from './exhibit-media.entity';

// Mirrors qr_exhibit_status. SRS B.3: Unpublished -> Published ->
// Unpublished or Disabled; archiving hides the page permanently.
export enum ExhibitStatus {
  UNPUBLISHED = 'UNPUBLISHED',
  PUBLISHED = 'PUBLISHED',
  DISABLED = 'DISABLED',
}

// Identifies the source specimen in curator views.
export class ExhibitSpecimenSummary {
  @ApiPropertyOptional({ nullable: true })
  commonName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  scientificName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  accessionNumber!: string | null;
}

export class Exhibit {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  specimenId!: string;

  @ApiProperty()
  createdBy!: string;

  @ApiProperty({ description: 'Unique URL segment used on the public QR page' })
  publicSlug!: string;

  @ApiProperty({
    example: 'https://museum.example/exhibits/giant-forest-beetle',
    nullable: true,
    description:
      'Public page URL encoded in the QR code (REQ-4.12-04); null only when PUBLIC_SITE_URL is not configured in production',
  })
  publicUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  interestingFacts!: string | null;

  @ApiPropertyOptional({ nullable: true })
  publicDescription!: string | null;

  @ApiPropertyOptional({ nullable: true })
  distribution!: string | null;

  @ApiPropertyOptional({ nullable: true })
  diet!: string | null;

  @ApiPropertyOptional({ nullable: true })
  layoutType!: string | null;

  @ApiProperty({
    enum: PUBLIC_SPECIMEN_FIELDS,
    isArray: true,
    description:
      'Specimen fields shown on the public page, in display order (REQ-4.12-03)',
  })
  publicSpecimenFields!: PublicSpecimenField[];

  @ApiProperty({
    enum: REQUIRED_EXHIBIT_CONTENT.map(({ key }) => key),
    isArray: true,
    description:
      'Exhibit content still empty; the exhibit can be published only when this is empty',
  })
  missingForPublish!: string[];

  @ApiProperty({ enum: ExhibitStatus, default: ExhibitStatus.UNPUBLISHED })
  status!: ExhibitStatus;

  @ApiProperty({
    description:
      'True when at least one uploaded AR asset is enabled, so the public page offers View in AR',
  })
  arEnabled!: boolean;

  @ApiProperty({
    description:
      'AR assets uploaded by a developer; the curator can enable AR only when this is above 0',
  })
  arAssetCount!: number;

  @ApiProperty({ type: ExhibitSpecimenSummary })
  specimen!: ExhibitSpecimenSummary;

  @ApiPropertyOptional({ nullable: true })
  publishedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  archivedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: [ExhibitMedia] })
  media?: ExhibitMedia[];
}

export class PublicExhibitTaxonomy {
  @ApiPropertyOptional({ nullable: true })
  kingdom?: string | null;

  @ApiPropertyOptional({ nullable: true })
  phylum?: string | null;

  @ApiPropertyOptional({ nullable: true })
  class?: string | null;

  @ApiPropertyOptional({ nullable: true })
  order?: string | null;

  @ApiPropertyOptional({ nullable: true })
  family?: string | null;

  @ApiPropertyOptional({ nullable: true })
  genus?: string | null;

  @ApiPropertyOptional({ nullable: true })
  species?: string | null;
}

export class PublicArModel {
  @ApiProperty({ enum: ['glb', 'usdz'] })
  format!: string;

  @ApiProperty({ description: 'Short-lived URL for the model file' })
  url!: string;
}

export class PublicExhibitAr {
  @ApiProperty({
    description:
      'Offer View in AR only when true and the device supports it (REQ-4.13-04)',
  })
  available!: boolean;

  @ApiProperty({ type: [PublicArModel] })
  models!: PublicArModel[];
}

// Public QR page content. Only approved public fields: never storage
// locations, condition notes, remarks, accession data, curator attribution,
// or audit data (REQ-4.12-08, REQ-4.13-07). Specimen fields the curator did
// not select are left out of the response (REQ-4.12-03); taxonomy is left out
// when no rank is selected.
export class PublicExhibitResponse {
  @ApiProperty({ description: 'Unique URL segment for the public QR page' })
  publicSlug!: string;

  @ApiPropertyOptional({ nullable: true })
  commonName?: string | null;

  @ApiPropertyOptional({ nullable: true })
  scientificName?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Collection name' })
  collection?: string | null;

  @ApiPropertyOptional({ type: PublicExhibitTaxonomy })
  taxonomy?: PublicExhibitTaxonomy;

  @ApiPropertyOptional({ nullable: true })
  habitat?: string | null;

  @ApiPropertyOptional({ nullable: true })
  ecologicalRole?: string | null;

  @ApiPropertyOptional({ nullable: true })
  conservationStatus?: string | null;

  @ApiPropertyOptional({ nullable: true })
  interestingFacts!: string | null;

  @ApiPropertyOptional({ nullable: true })
  publicDescription!: string | null;

  @ApiPropertyOptional({ nullable: true })
  distribution!: string | null;

  @ApiPropertyOptional({ nullable: true })
  diet!: string | null;

  @ApiPropertyOptional({ nullable: true })
  layoutType!: string | null;

  @ApiProperty({ type: [PublicExhibitMedia] })
  media!: PublicExhibitMedia[];

  @ApiProperty({ type: PublicExhibitAr })
  ar!: PublicExhibitAr;
}
