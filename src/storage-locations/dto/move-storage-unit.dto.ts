// src/storage-locations/dto/move-storage-unit.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

export class MoveStorageUnitDto {
  @ApiProperty({
    description: 'New parent storage unit id, or null to move to the root',
    nullable: true,
  })
  @IsDefined()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID()
  newParentId!: string | null;

  @ApiPropertyOptional({
    description: 'Reason recorded in movement history',
    nullable: true,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  reason?: string | null;
}
