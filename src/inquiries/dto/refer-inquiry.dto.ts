import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';
import { MAX_INTERNAL_NOTE_LENGTH } from '../../communication-history/dto/create-internal-note.dto';
import {
  MAX_PREFERRED_SCHEDULES,
  MAX_VISITOR_COUNT,
} from '../../visit-requests/dto/create-visit-request.dto';
import { PreferredScheduleDto } from '../../visit-requests/dto/preferred-schedule.dto';

// Manual referral of an inquiry to the Visit Request workflow (REQ-4.8-07).
// Name, email, and consent come from the inquiry. The curator supplies the
// visit details the inquiry form does not collect; phone and organization
// are needed only when the inquiry did not include them.
export class ReferInquiryDto {
  @ApiPropertyOptional({
    example: '0917 123 4567',
    maxLength: 20,
    description: "Defaults to the inquiry's contact number",
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(/^[0-9+()\-\s]{7,20}$/, {
    message: 'phone must be 7-20 digits, spaces, or + ( ) - characters',
  })
  phone?: string;

  @ApiPropertyOptional({
    example: 'University of San Carlos',
    maxLength: 255,
    description: "Defaults to the inquiry's organization",
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  organization?: string;

  @ApiPropertyOptional({ example: 'Class field trip', maxLength: 1000 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  purpose?: string;

  @ApiProperty({ example: 20, minimum: 1, maximum: MAX_VISITOR_COUNT })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VISITOR_COUNT)
  visitorCount!: number;

  @ApiProperty({
    type: [PreferredScheduleDto],
    minItems: 1,
    maxItems: MAX_PREFERRED_SCHEDULES,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PREFERRED_SCHEDULES)
  @ValidateNested({ each: true })
  @Type(() => PreferredScheduleDto)
  preferredSchedules!: PreferredScheduleDto[];

  @ApiPropertyOptional({
    description: 'Referral note recorded on the inquiry',
    maxLength: MAX_INTERNAL_NOTE_LENGTH,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_INTERNAL_NOTE_LENGTH)
  note?: string;
}
