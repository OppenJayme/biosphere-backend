import { ApiProperty } from '@nestjs/swagger';

export class MuseumCollection {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  collectionName!: string;

  @ApiProperty({ format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: Date;
}

export class CollectionPage {
  @ApiProperty({ type: [MuseumCollection] })
  items!: MuseumCollection[];

  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  limit!: number;
}
