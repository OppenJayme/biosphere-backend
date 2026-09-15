import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

export class UpdateSpecimenMediaDto {
  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional()
  @ValidateIf((_object, value: unknown) => value !== null)
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  caption?: string | null;

  @ApiPropertyOptional({ minimum: 0, maximum: 2147483647 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  displayOrder?: number;
}
