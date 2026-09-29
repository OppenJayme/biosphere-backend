import { BadRequestException } from '@nestjs/common';
import { InquiryStatus } from './entities/inquiry.entity';

// SRS B.3: Pending -> Reviewed -> Closed; Pending or Reviewed -> Turned to
// Visit Request. An inquiry must be reviewed before it is closed. Closed and
// Turned to Visit Request are final, so a closed inquiry stays as an archived
// record.
const ALLOWED_TRANSITIONS: Record<InquiryStatus, readonly InquiryStatus[]> = {
  [InquiryStatus.PENDING]: [
    InquiryStatus.REVIEWED,
    InquiryStatus.TURNED_TO_VISIT_REQUEST,
  ],
  [InquiryStatus.REVIEWED]: [
    InquiryStatus.CLOSED,
    InquiryStatus.TURNED_TO_VISIT_REQUEST,
  ],
  [InquiryStatus.TURNED_TO_VISIT_REQUEST]: [],
  [InquiryStatus.CLOSED]: [],
};

export function assertInquiryTransition(
  from: InquiryStatus,
  to: InquiryStatus,
): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(
      `An inquiry cannot move from ${from} to ${to}.`,
    );
  }
}

// Only a finished inquiry can be deleted; active ones must be closed first.
export const DELETABLE_INQUIRY_STATUSES: readonly InquiryStatus[] = [
  InquiryStatus.CLOSED,
  InquiryStatus.TURNED_TO_VISIT_REQUEST,
];
