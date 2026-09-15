import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

export class ChangeSpecimenLotConditionDto {
  @ApiProperty({ description: 'New curator-managed condition classification' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'targetConditionClass must contain visible text' })
  targetConditionClass!: string;

  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantity!: number;

  @ApiPropertyOptional({
    description: 'Optional curator reason recorded with the condition change',
    nullable: true,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  reason?: string | null;
}
