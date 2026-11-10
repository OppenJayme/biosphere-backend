// src/storage-locations/dto/create-storage-unit.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

export class CreateStorageUnitDto {
  @ApiProperty({ example: 'Cabinet A-3' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({
    example: 'CABINET',
    description: 'Curator-managed structural classification',
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  unitType!: string;

  @ApiProperty({
    example: 'DRY_STORAGE',
    description: 'Curator-managed storage classification',
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  storageType!: string;

  @ApiPropertyOptional({ example: '120 cm x 60 cm x 200 cm', nullable: true })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  size?: string | null;

  @ApiPropertyOptional({
    description: 'Parent storage unit id, omit for a top-level room/gallery',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  parentId?: string | null;

  @ApiPropertyOptional({ default: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  holdsSpecimens?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;
}
