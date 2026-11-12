import { REPORT_TIMEZONE } from '../report-period';

const GENERATED_AT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: REPORT_TIMEZONE,
});

export function formatGeneratedAt(date: Date): string {
  return `${GENERATED_AT.format(date)} (PHT)`;
}

export const REPORT_INSTITUTION = 'University of San Carlos';
export const REPORT_MUSEUM = 'USC Biological Museum';
