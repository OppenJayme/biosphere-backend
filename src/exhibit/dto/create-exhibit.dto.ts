import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import type { PublicSpecimenField } from '../exhibit-public-fields';
import { PublicSpecimenFieldsProperty } from './public-specimen-fields.decorator';

export class CreateExhibitDto {
  @ApiProperty({
    description:
      'Existing specimen UUID; must be Cataloged and approved for public display',
  })
  @IsUUID()
  specimenId!: string;

  @ApiProperty({
    example: 'six-legged-carabao',
    description: 'Unique URL segment for the public QR exhibit page',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, {
    message:
      'publicSlug may only contain lowercase letters, numbers, and single hyphens',
  })
  publicSlug!: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  interestingFacts?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  publicDescription?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  distribution?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  diet?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  layoutType?: string | null;

  @PublicSpecimenFieldsProperty()
  publicSpecimenFields?: PublicSpecimenField[];
}
