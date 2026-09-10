// src/storage-locations/entities/storage-unit.entity.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StorageUnit {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  unitType!: string;

  @ApiProperty()
  storageType!: string;

  @ApiPropertyOptional()
  size!: string | null;

  @ApiPropertyOptional({ description: 'Null for a top-level room/gallery' })
  parentId?: string | null;

  @ApiProperty({ default: false })
  holdsSpecimens!: boolean;

  @ApiPropertyOptional()
  capacity!: number | null;

  @ApiPropertyOptional()
  archivedAt!: Date | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
