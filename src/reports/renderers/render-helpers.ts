import type { ReportDocument } from '../report-document';
import { REPORT_TIMEZONE } from '../report-period';

const LANDSCAPE_COLUMN_THRESHOLD = 6;

const GENERATED_AT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: REPORT_TIMEZONE,
});

/** Wide detail tables are laid out on landscape pages. */
export function usesLandscape(report: ReportDocument): boolean {
  return report.blocks.some(
    (block) =>
      block.kind === 'table' &&
      block.table.columns.length > LANDSCAPE_COLUMN_THRESHOLD,
  );
}

export function formatGeneratedAt(date: Date): string {
  return `${GENERATED_AT.format(date)} (PHT)`;
}
