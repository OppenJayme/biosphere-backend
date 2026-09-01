// src/storage-locations/dto/create-storage-unit.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { StorageUnitType } from '../entities/storage-unit.entity';

export class CreateStorageUnitDto {
  @ApiProperty({ example: 'Cabinet A-3' })
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ enum: StorageUnitType })
  @IsEnum(StorageUnitType)
  type!: StorageUnitType;

  @ApiPropertyOptional({
    description: 'Parent storage unit id, omit for a top-level room/gallery',
  })
  @IsOptional()
  @IsString()
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
