import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SpecimenTaxonomy {
  @ApiProperty()
  specimenId!: string;

  @ApiPropertyOptional({ nullable: true })
  kingdom!: string | null;

  @ApiPropertyOptional({ nullable: true })
  phylum!: string | null;

  @ApiPropertyOptional({ nullable: true })
  class!: string | null;

  @ApiPropertyOptional({ nullable: true })
  orderName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  family!: string | null;

  @ApiPropertyOptional({ nullable: true })
  genus!: string | null;

  @ApiPropertyOptional({ nullable: true })
  species!: string | null;

  @ApiPropertyOptional({ nullable: true })
  habitat!: string | null;

  @ApiPropertyOptional({ nullable: true })
  ecologicalRole!: string | null;

  @ApiPropertyOptional({ nullable: true })
  conservationStatus!: string | null;
}
