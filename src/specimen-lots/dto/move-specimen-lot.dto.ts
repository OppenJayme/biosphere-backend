import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

export class MoveSpecimenLotDto {
  @ApiProperty({ description: 'Active destination storage unit UUID' })
  @IsUUID()
  targetStorageUnitId!: string;

  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Optional curator reason recorded with the movement',
    nullable: true,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  reason?: string | null;
}
