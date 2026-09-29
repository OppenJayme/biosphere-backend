import { BadRequestException } from '@nestjs/common';
import { VisitRequestStatus } from './entities/visit-request.entity';

// SRS B.3: Pending -> Approved by Curator -> Submitted for Campus Entry ->
// Completed. Pending or Approved requests may become Declined or Cancelled;
// once submitted for campus entry, a request can only be completed.
// Completed, Declined, and Cancelled are final, so the record is kept as
// history instead of being deleted. There is no Confirmed status: it is not in
// REQ-4.9-09 or the visit_request_status enum.
const ALLOWED_TRANSITIONS: Record<
  VisitRequestStatus,
  readonly VisitRequestStatus[]
> = {
  [VisitRequestStatus.PENDING]: [
    VisitRequestStatus.APPROVED_BY_CURATOR,
    VisitRequestStatus.DECLINED,
    VisitRequestStatus.CANCELLED,
  ],
  [VisitRequestStatus.APPROVED_BY_CURATOR]: [
    VisitRequestStatus.SUBMITTED_FOR_CAMPUS_ENTRY,
    VisitRequestStatus.DECLINED,
    VisitRequestStatus.CANCELLED,
  ],
  [VisitRequestStatus.SUBMITTED_FOR_CAMPUS_ENTRY]: [
    VisitRequestStatus.COMPLETED,
  ],
  [VisitRequestStatus.COMPLETED]: [],
  [VisitRequestStatus.DECLINED]: [],
  [VisitRequestStatus.CANCELLED]: [],
};

// Statuses whose approved schedule and visitors go to the manual USC
// campus-entry process (REQ-4.9-12).
export const CAMPUS_ENTRY_STATUSES: readonly VisitRequestStatus[] = [
  VisitRequestStatus.APPROVED_BY_CURATOR,
  VisitRequestStatus.SUBMITTED_FOR_CAMPUS_ENTRY,
];

export function assertVisitRequestTransition(
  from: VisitRequestStatus,
  to: VisitRequestStatus,
): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new BadRequestException(
      `A visit request cannot move from ${from} to ${to}.`,
    );
  }
}

// Only a finished request can be deleted; active ones must be declined,
// cancelled, or completed first.
export const DELETABLE_VISIT_REQUEST_STATUSES: readonly VisitRequestStatus[] = [
  VisitRequestStatus.DECLINED,
  VisitRequestStatus.CANCELLED,
  VisitRequestStatus.COMPLETED,
];
