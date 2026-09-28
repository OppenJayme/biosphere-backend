import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';
import { MAX_INTERNAL_NOTE_LENGTH } from '../../communication-history/dto/create-internal-note.dto';
import { InquiryStatus } from '../entities/inquiry.entity';

// Curators change workflow status only; the visitor's submitted content is
// never edited. TURNED_TO_VISIT_REQUEST is set only by the referral action
// (REQ-4.8-07).
export const CURATOR_SETTABLE_INQUIRY_STATUSES = [
  InquiryStatus.REVIEWED,
  InquiryStatus.CLOSED,
] as const;

export class UpdateInquiryDto {
  @ApiProperty({ enum: CURATOR_SETTABLE_INQUIRY_STATUSES })
  @IsIn(CURATOR_SETTABLE_INQUIRY_STATUSES)
  status!: (typeof CURATOR_SETTABLE_INQUIRY_STATUSES)[number];

  @ApiPropertyOptional({
    description: 'Decision or follow-up note recorded with the change',
    maxLength: MAX_INTERNAL_NOTE_LENGTH,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_INTERNAL_NOTE_LENGTH)
  note?: string;
}
