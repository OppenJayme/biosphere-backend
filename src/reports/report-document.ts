// Format-neutral report model. Report builders produce a ReportDocument and
// the CSV, PDF, and DOCX renderers turn the same document into a file, so
// every report type supports every format without format-specific queries.

export type ReportCell = string | number | null;

export interface ReportTable {
  title?: string;
  columns: string[];
  rows: ReportCell[][];
}

export type ReportBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'keyValues'; items: { label: string; value: ReportCell }[] }
  | { kind: 'table'; table: ReportTable };

export interface ReportDocument {
  title: string;
  periodLabel: string;
  generatedAt: Date;
  generatedBy: string;
  /**
   * Marks reports that carry private visitor details or internal
   * storage-location data (REQ-4.7-13). Renderers print a notice on them.
   */
  confidential: boolean;
  blocks: ReportBlock[];
  /** The detail table exported as CSV; absent for summary-only reports. */
  csvTable?: ReportTable;
  /** Detail rows in the report, recorded in the audit log. */
  rowCount: number;
}

export const CONFIDENTIAL_NOTICE =
  'CONFIDENTIAL: internal museum report. Contains private visitor or internal ' +
  'storage information. Do not publish or share outside authorized staff.';

export function formatCell(value: ReportCell): string {
  if (value === null) return '';
  return typeof value === 'number' ? value.toLocaleString('en-US') : value;
}
