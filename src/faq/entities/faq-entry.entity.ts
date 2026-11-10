import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum FaqStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export class FaqEntry {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  question!: string;

  @ApiProperty()
  answer!: string;

  @ApiProperty({ type: [String] })
  alternativeWording!: string[];

  @ApiProperty({ type: [String] })
  keywords!: string[];

  @ApiPropertyOptional({ nullable: true })
  category!: string | null;

  @ApiProperty({ enum: FaqStatus })
  status!: FaqStatus;

  @ApiProperty()
  createdBy!: string;

  @ApiPropertyOptional({ nullable: true })
  updatedBy!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class FaqEntryPage {
  @ApiProperty({ type: [FaqEntry] })
  items!: FaqEntry[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
