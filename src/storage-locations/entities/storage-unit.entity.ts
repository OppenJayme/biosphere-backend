// src/storage-locations/entities/storage-unit.entity.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum StorageUnitType {
  ROOM = 'ROOM',
  CABINET = 'CABINET',
  DRAWER = 'DRAWER',
  SHELF = 'SHELF',
  BOX = 'BOX',
  VIAL = 'VIAL',
  OTHER = 'OTHER',
}

export class StorageUnit {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty({ enum: StorageUnitType })
  type!: StorageUnitType;

  @ApiPropertyOptional({ description: 'Null for a top-level room/gallery' })
  parentId?: string | null;

  @ApiProperty({ default: false })
  holdsSpecimens!: boolean;

  @ApiPropertyOptional()
  capacity?: number;

  @ApiPropertyOptional()
  archivedAt?: Date | null;

  @ApiProperty()
  createdAt!: Date;
}
