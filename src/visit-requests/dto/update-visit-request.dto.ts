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
import { VisitRequestStatus } from '../entities/visit-request.entity';

// Curators change workflow status only (REQ-4.9-09); the visitor's
// submitted details are never edited. APPROVED_BY_CURATOR is set only by
// approving a preferred schedule (REQ-4.9-16).
export const CURATOR_SETTABLE_VISIT_REQUEST_STATUSES = [
  VisitRequestStatus.SUBMITTED_FOR_CAMPUS_ENTRY,
  VisitRequestStatus.COMPLETED,
  VisitRequestStatus.DECLINED,
  VisitRequestStatus.CANCELLED,
] as const;

export class UpdateVisitRequestDto {
  @ApiProperty({ enum: CURATOR_SETTABLE_VISIT_REQUEST_STATUSES })
  @IsIn(CURATOR_SETTABLE_VISIT_REQUEST_STATUSES)
  status!: (typeof CURATOR_SETTABLE_VISIT_REQUEST_STATUSES)[number];

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
