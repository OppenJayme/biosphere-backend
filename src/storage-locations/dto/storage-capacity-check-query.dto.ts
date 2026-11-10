import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class StorageCapacityCheckQueryDto {
  @ApiPropertyOptional({
    default: 0,
    minimum: 0,
    maximum: 2147483647,
    description: 'Quantity the curator is about to place in this unit',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  additionalQuantity = 0;
}
