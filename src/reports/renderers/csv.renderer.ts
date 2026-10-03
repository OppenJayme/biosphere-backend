import type { ReportCell, ReportTable } from '../report-document';

const UTF8_BOM = String.fromCharCode(0xfeff);

// Cells that spreadsheet apps would evaluate as formulas (CSV injection).
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * RFC 4180 CSV with CRLF line endings and a UTF-8 byte-order mark so Excel
 * opens accented names correctly.
 */
export function renderCsv(table: ReportTable): Buffer {
  const lines = [table.columns, ...table.rows].map((row) =>
    row.map(toCsvField).join(','),
  );
  return Buffer.from(`${UTF8_BOM}${lines.join('\r\n')}\r\n`, 'utf8');
}

function toCsvField(value: ReportCell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const text = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
