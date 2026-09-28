import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { InquiryStatus } from '../entities/inquiry.entity';

// Curators change workflow status only; the visitor's submitted content is
// never edited. TURNED_TO_VISIT_REQUEST is reserved for the referral
// workflow (REQ-4.8-07), which is not implemented yet.
export const CURATOR_SETTABLE_INQUIRY_STATUSES = [
  InquiryStatus.PENDING,
  InquiryStatus.REVIEWED,
  InquiryStatus.CLOSED,
] as const;

export class UpdateInquiryDto {
  @ApiProperty({ enum: CURATOR_SETTABLE_INQUIRY_STATUSES })
  @IsIn(CURATOR_SETTABLE_INQUIRY_STATUSES)
  status!: (typeof CURATOR_SETTABLE_INQUIRY_STATUSES)[number];
}
