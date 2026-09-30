import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';
import { MAX_INTERNAL_NOTE_LENGTH } from '../../communication-history/dto/create-internal-note.dto';
import { MAX_VISITOR_MESSAGE_LENGTH } from '../../communication-history/dto/send-visitor-message.dto';
import { VisitRequestStatus } from '../entities/visit-request.entity';

// Curators change workflow status only (REQ-4.9-09); the visitor's
// submitted details are never edited. APPROVED_BY_CURATOR is set only by
// approving a preferred schedule (RED-4.9.17).
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

  @ApiPropertyOptional({
    default: true,
    description:
      'Email the visitor about a DECLINED or CANCELLED decision (REQ-4.9-11). Ignored for other statuses.',
  })
  @IsOptional()
  @IsBoolean()
  notifyVisitor?: boolean;

  @ApiPropertyOptional({
    description:
      'Message to the visitor included in that email. Unlike `note`, the visitor sees it.',
    maxLength: MAX_VISITOR_MESSAGE_LENGTH,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_VISITOR_MESSAGE_LENGTH)
  visitorMessage?: string;
}
