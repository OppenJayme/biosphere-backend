// src/storage-locations/dto/move-storage-unit.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDefined,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

export class MoveStorageUnitDto {
  @ApiProperty({
    description: 'New parent storage unit id, or null to move to the root',
    nullable: true,
  })
  @IsDefined()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsUUID()
  newParentId!: string | null;

  @ApiPropertyOptional({ description: 'Reason recorded in movement history' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  reason?: string;
}
