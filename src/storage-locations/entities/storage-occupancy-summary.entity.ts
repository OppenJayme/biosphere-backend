import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StorageOccupancySummary {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiPropertyOptional({ nullable: true })
  capacity!: number | null;

  @ApiProperty({
    description: 'Sum of quantity across active specimen lots in this unit',
  })
  occupiedQuantity!: number;

  @ApiProperty({
    description: 'Count of capacity breaches for this unit (0 or 1 for now)',
  })
  alertCount!: number;
}
