// src/storage-locations/dto/create-storage-unit.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateStorageUnitDto {
  @ApiProperty({ example: 'Cabinet A-3' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({
    example: 'CABINET',
    description: 'Curator-managed structural classification',
  })
  @IsString()
  @IsNotEmpty()
  unitType!: string;

  @ApiProperty({
    example: 'DRY_STORAGE',
    description: 'Curator-managed storage classification',
  })
  @IsString()
  @IsNotEmpty()
  storageType!: string;

  @ApiPropertyOptional({ example: '120 cm x 60 cm x 200 cm' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  size?: string;

  @ApiPropertyOptional({
    description: 'Parent storage unit id, omit for a top-level room/gallery',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  holdsSpecimens?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}
