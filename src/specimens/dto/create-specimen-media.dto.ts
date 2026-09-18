import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

function parseMultipartInteger({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  return /^\d+$/.test(value) ? Number(value) : value;
}

function parseMultipartBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class CreateSpecimenMediaDto {
  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  caption?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 2147483647 })
  @IsOptional()
  @Transform(parseMultipartInteger)
  @IsInt()
  @Min(0)
  @Max(2147483647)
  displayOrder?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @Transform(parseMultipartBoolean)
  @IsBoolean()
  isCover?: boolean;
}
