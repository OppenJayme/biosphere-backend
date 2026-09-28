import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors the general_inquiry_status database enum (SRS REQ-4.8-06).
export enum InquiryStatus {
  PENDING = 'PENDING',
  REVIEWED = 'REVIEWED',
  TURNED_TO_VISIT_REQUEST = 'TURNED_TO_VISIT_REQUEST',
  CLOSED = 'CLOSED',
}

// Returned to the public submitter. Deliberately echoes no personal data.
export class InquirySubmissionReceipt {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: InquiryStatus })
  status!: InquiryStatus;

  @ApiProperty()
  submittedAt!: Date;
}

// Curator-only view of a stored inquiry.
export class Inquiry {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ nullable: true })
  phone!: string | null;

  @ApiPropertyOptional({ nullable: true })
  organization!: string | null;

  @ApiProperty()
  inquiryType!: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ enum: InquiryStatus })
  status!: InquiryStatus;

  @ApiPropertyOptional({ nullable: true })
  consentAcceptedAt!: Date | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Account id of the curator who last changed the status',
  })
  reviewedBy!: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Visit request created by referring this inquiry, if any',
  })
  visitRequestId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class InquiryReferralResult {
  @ApiProperty({ type: Inquiry })
  inquiry!: Inquiry;

  @ApiProperty({ description: 'The new Pending visit request' })
  visitRequestId!: string;
}
