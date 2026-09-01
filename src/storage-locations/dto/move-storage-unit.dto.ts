// src/storage-locations/dto/move-storage-unit.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class MoveStorageUnitDto {
  @ApiProperty({ description: 'New parent storage unit id' })
  @IsString()
  @IsNotEmpty()
  newParentId!: string;
}
