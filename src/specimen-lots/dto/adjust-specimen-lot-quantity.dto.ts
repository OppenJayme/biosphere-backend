import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';
import { QuantityAdjustmentType } from '../entities/specimen-lot-transaction.entity';

export class AdjustSpecimenLotQuantityDto {
  @ApiProperty({ enum: QuantityAdjustmentType })
  @IsEnum(QuantityAdjustmentType)
  adjustmentType!: QuantityAdjustmentType;

  @ApiProperty({
    description:
      'Signed quantity change. ADDITION must be positive; removal types must be negative; DATA_CORRECTION may use either sign.',
    minimum: -2147483647,
    maximum: 2147483647,
    example: -2,
  })
  @IsInt()
  @Min(-2147483647)
  @Max(2147483647)
  @NotEquals(0)
  quantityDelta!: number;

  @ApiProperty({
    description:
      'Active lot quantity shown to the curator before this command was submitted',
    minimum: 1,
    maximum: 2147483647,
  })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedQuantity!: number;

  @ApiProperty({
    description: 'Curator reason retained in transaction and revision history',
    maxLength: 2000,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
