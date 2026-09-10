// src/storage-locations/dto/update-storage-unit.dto.ts
import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateStorageUnitDto } from './create-storage-unit.dto';

export class UpdateStorageUnitDto extends PartialType(
  OmitType(CreateStorageUnitDto, ['parentId'] as const),
) {}
