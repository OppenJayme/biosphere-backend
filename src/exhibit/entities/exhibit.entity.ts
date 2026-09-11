import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExhibitMedia } from './exhibit-media.entity';

export enum ExhibitStatus {
  UNPUBLISHED = 'UNPUBLISHED',
  PUBLISHED = 'PUBLISHED',
  DISABLED = 'DISABLED',
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

  @ApiProperty({ enum: ExhibitStatus, default: ExhibitStatus.UNPUBLISHED })
  status!: ExhibitStatus;

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
