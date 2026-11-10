import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StorageMovement {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  storageUnitId!: string;

  @ApiPropertyOptional({ nullable: true })
  fromStorageUnitId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  toStorageUnitId!: string | null;

  @ApiProperty()
  movedBy!: string;

  @ApiProperty()
  movedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  reason!: string | null;
}
