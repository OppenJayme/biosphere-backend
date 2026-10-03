import { REPORT_TIMEZONE } from './report-period';

export const SPECIMEN_STATUS_LABELS = {
  UNCATALOGED: 'Uncataloged',
  CATALOGED: 'Cataloged',
  ARCHIVED: 'Archived',
} as const;

export const INQUIRY_STATUS_LABELS = {
  PENDING: 'Pending',
  REVIEWED: 'Reviewed',
  TURNED_TO_VISIT_REQUEST: 'Turned to visit request',
  CLOSED: 'Closed',
} as const;

export const VISIT_STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED_BY_CURATOR: 'Approved by curator',
  SUBMITTED_FOR_CAMPUS_ENTRY: 'Submitted for campus entry',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
} as const;

export const EXHIBIT_STATUS_LABELS = {
  PUBLISHED: 'Published',
  UNPUBLISHED: 'Unpublished',
  DISABLED: 'Disabled',
} as const;

export const LOT_TRANSACTION_LABELS = {
  MOVEMENT: 'Movement',
  CONDITION_CHANGE: 'Condition change',
  SPLIT: 'Split',
  MERGE: 'Merge',
  QUANTITY_ADJUSTMENT: 'Quantity adjustment',
} as const;

export const ADJUSTMENT_LABELS = {
  ADDITION: 'Addition',
  REMOVAL: 'Removal',
  TRANSFER_OUT: 'Transfer out',
  DEACCESSION: 'Deaccession',
  MISSING_LOSS: 'Missing or lost',
  DESTRUCTION: 'Destruction',
  DATA_CORRECTION: 'Data correction',
} as const;

const DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: REPORT_TIMEZONE,
});

/** Calendar date in Philippine time, e.g. "Sep 30, 2026". */
export function formatReportDate(value: Date | null): string | null {
  return value ? DATE.format(value) : null;
}

/** A Postgres DATE column, which Prisma returns as UTC midnight. */
export function formatDateOnly(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(value);
}

/** A Postgres TIME column, which Prisma returns on 1970-01-01 UTC. */
export function formatTimeOnly(value: Date): string {
  return value.toISOString().slice(11, 16);
}
