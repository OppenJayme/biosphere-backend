import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';
import { MAX_INTERNAL_NOTE_LENGTH } from '../../communication-history/dto/create-internal-note.dto';
import { MAX_PREFERRED_SCHEDULES } from './create-visit-request.dto';

// Approves one of the visitor's preferred options (REQ-4.9-16). The other
// options stay stored as part of the request history.
export class ApproveVisitScheduleDto {
  @ApiProperty({
    example: 1,
    minimum: 1,
    maximum: MAX_PREFERRED_SCHEDULES,
    description: 'preferenceOrder of the option being approved',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PREFERRED_SCHEDULES)
  preferenceOrder!: number;

  @ApiPropertyOptional({
    description: 'Decision note recorded with the approval',
    maxLength: MAX_INTERNAL_NOTE_LENGTH,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_INTERNAL_NOTE_LENGTH)
  note?: string;
}
