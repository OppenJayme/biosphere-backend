import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

export class CheckAccessionNumberQueryDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  accessionNumber!: string;

  @ApiPropertyOptional({
    description:
      'The record being edited, so its own current number is not reported as taken',
  })
  @IsOptional()
  @IsUUID()
  excludeSpecimenId?: string;
}
