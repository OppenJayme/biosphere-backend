import { strToU8, zipSync } from 'fflate';

/** One worksheet: a header row, then data rows of text, numbers or blanks. */
export interface XlsxSheet {
  name: string;
  header: string[];
  rows: XlsxCell[][];
}

export type XlsxCell = string | number | null;

export interface XlsxResult {
  body: Buffer;
  /** Cells cut at Excel's per-cell limit, per sheet name. */
  truncated: Record<string, number>;
}

/** Excel's hard limit on characters in one cell. */
export const MAX_CELL_CHARS = 32_767;
export const TRUNCATION_MARK = ' [truncated]';
const MAX_SHEET_NAME = 31;

// A cell that starts with one of these could become a formula if someone
// edits it in Excel. They are stored with Excel's "quote prefix" style
// (shown as plain text, kept as text on edit) instead of a literal
// apostrophe, so the value itself is unchanged.
const FORMULA_START = /^[=+\-@\t\r]/;

// XML 1.0 forbids most control characters; a form value may still hold them.
// eslint-disable-next-line no-control-regex -- removing these characters is the point
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

function escapeXml(value: string): string {
  return value
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A1-style column letters for a zero-based column index. */
export function columnName(index: number): string {
  let name = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

// Style ids from styles.xml below: 0 default, 1 bold header, 2 quote prefix.
const STYLE_HEADER = 1;
const STYLE_QUOTED = 2;

function cellXml(
  ref: string,
  value: XlsxCell,
  header: boolean,
  onTruncate: () => void,
): string {
  if (value === null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value) && !header) {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  let text = String(value);
  if (text.length > MAX_CELL_CHARS) {
    text =
      text.slice(0, MAX_CELL_CHARS - TRUNCATION_MARK.length) + TRUNCATION_MARK;
    onTruncate();
  }
  const style = header
    ? STYLE_HEADER
    : FORMULA_START.test(text)
      ? STYLE_QUOTED
      : 0;
  const s = style ? ` s="${style}"` : '';
  const space = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : '';
  return `<c r="${ref}" t="inlineStr"${s}><is><t${space}>${escapeXml(text)}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet, onTruncate: () => void): string {
  const width = sheet.header.length;
  const rows = [sheet.header, ...sheet.rows].map((row, r) => {
    const cells = Array.from({ length: width }, (_, c) =>
      cellXml(`${columnName(c)}${r + 1}`, row[c] ?? null, r === 0, onTruncate),
    ).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  });
  const lastRef = `${columnName(Math.max(width - 1, 0))}${rows.length}`;
  const cols = sheet.header
    .map((label, c) => {
      const longest = Math.max(
        label.length,
        ...sheet.rows.slice(0, 200).map((row) => String(row[c] ?? '').length),
      );
      const w = Math.min(Math.max(longest + 2, 10), 60);
      return `<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<dimension ref="A1:${lastRef}"/>` +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows.join('')}</sheetData>` +
    '</worksheet>'
  );
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" quotePrefix="1" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

/**
 * Builds a minimal .xlsx (SpreadsheetML) workbook: inline strings, a bold
 * frozen header row per sheet, no macros, no shared formulas. Uses fflate,
 * already a dependency for the specimen XLSX import.
 */
export function buildXlsx(sheets: XlsxSheet[]): XlsxResult {
  const names = new Set<string>();
  for (const sheet of sheets) {
    if (
      !sheet.name ||
      sheet.name.length > MAX_SHEET_NAME ||
      /[[\]:*?/\\]/.test(sheet.name) ||
      names.has(sheet.name.toLowerCase())
    ) {
      throw new Error(`Invalid or duplicate sheet name: ${sheet.name}`);
    }
    names.add(sheet.name.toLowerCase());
  }

  const truncated: Record<string, number> = {};
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' +
        sheets
          .map(
            (sheet, i) =>
              `<sheet name="${escapeXml(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
          )
          .join('') +
        '</sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(STYLES),
  };
  sheets.forEach((sheet, i) => {
    truncated[sheet.name] = 0;
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      sheetXml(sheet, () => {
        truncated[sheet.name] += 1;
      }),
    );
  });

  return { body: Buffer.from(zipSync(files, { level: 6 })), truncated };
}
