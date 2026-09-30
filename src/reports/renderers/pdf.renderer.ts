import PDFDocument from 'pdfkit';
import {
  CONFIDENTIAL_NOTICE,
  formatCell,
  type ReportBlock,
  type ReportCell,
  type ReportDocument,
  type ReportTable,
} from '../report-document';
import { formatGeneratedAt, usesLandscape } from './render-helpers';

type Pdf = PDFKit.PDFDocument;

const MARGIN = 40;
const FOOTER_HEIGHT = 24;
const CELL_PADDING = 3;
const TABLE_FONT_SIZE = 7.5;
const MAX_NATURAL_COLUMN_WIDTH = 180;
const MAX_WORD_WIDTH = 90;
const BRAND = '#1F5130';
const HEADER_FILL = '#E3EEE6';
const RULE = '#C9D3CC';

/** Printable PDF output (REQ-4.7-12). */
export function renderPdf(report: ReportDocument): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: usesLandscape(report) ? 'landscape' : 'portrait',
    margins: {
      top: MARGIN,
      bottom: MARGIN + FOOTER_HEIGHT,
      left: MARGIN,
      right: MARGIN,
    },
    bufferPages: true,
    info: { Title: report.title, Author: 'BioSphere', Creator: 'BioSphere' },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .fillColor(BRAND)
    .text(pdfText(report.title));
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).fillColor('#333333');
  doc.text(pdfText(`Reporting period: ${report.periodLabel}`));
  doc.text(
    pdfText(
      `Generated ${formatGeneratedAt(report.generatedAt)} by ${report.generatedBy}`,
    ),
  );
  if (report.confidential) {
    doc.moveDown(0.5);
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#9B1C1C')
      .text(pdfText(CONFIDENTIAL_NOTICE));
  }
  doc.fillColor('#000000');

  for (const block of report.blocks) renderBlock(doc, block);
  addPageFooters(doc, report);
  doc.end();
  return done;
}

function renderBlock(doc: Pdf, block: ReportBlock): void {
  switch (block.kind) {
    case 'heading':
      ensureSpace(doc, 60);
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(13).fillColor(BRAND);
      doc.text(pdfText(block.text), MARGIN);
      doc.fillColor('#000000').moveDown(0.3);
      return;
    case 'paragraph':
      doc.font('Helvetica').fontSize(10).text(pdfText(block.text), MARGIN);
      doc.moveDown(0.5);
      return;
    case 'keyValues':
      renderTable(
        doc,
        {
          columns: [],
          rows: block.items.map((item) => [item.label, item.value]),
        },
        { boldFirstColumn: true, maxWidth: 340 },
      );
      return;
    case 'table':
      renderTable(doc, block.table);
      return;
  }
}

function renderTable(
  doc: Pdf,
  table: ReportTable,
  options: { boldFirstColumn?: boolean; maxWidth?: number } = {},
): void {
  if (table.title) {
    ensureSpace(doc, 50);
    doc.moveDown(0.5);
    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .text(pdfText(table.title), MARGIN);
    doc.moveDown(0.2);
  }
  if (table.rows.length === 0) {
    doc
      .font('Helvetica-Oblique')
      .fontSize(9)
      .text('No records for this selection.', MARGIN);
    doc.moveDown(0.5);
    return;
  }

  const available = Math.min(
    doc.page.width - MARGIN * 2,
    options.maxWidth ?? Number.POSITIVE_INFINITY,
  );
  const widths = columnWidths(doc, table, available, options.boldFirstColumn);
  const drawHeader = () => {
    if (table.columns.length > 0)
      drawRow(doc, table.columns, widths, {
        header: true,
        numericColumns: table.rows[0]?.map(
          (value) => typeof value === 'number',
        ),
      });
  };

  doc.x = MARGIN;
  drawHeader();
  for (const row of table.rows) {
    const height = rowHeight(doc, row, widths, {
      boldFirstColumn: options.boldFirstColumn,
    });
    if (doc.y + height > pageBottom(doc)) {
      doc.addPage();
      drawHeader();
    }
    drawRow(doc, row, widths, { boldFirstColumn: options.boldFirstColumn });
  }
  doc.x = MARGIN;
  doc.moveDown(0.8);
}

function drawRow(
  doc: Pdf,
  row: ReportCell[],
  widths: number[],
  options: {
    header?: boolean;
    boldFirstColumn?: boolean;
    numericColumns?: boolean[];
  },
): void {
  const setFont = (column: number) =>
    doc
      .font(
        options.header || (options.boldFirstColumn && column === 0)
          ? 'Helvetica-Bold'
          : 'Helvetica',
      )
      .fontSize(TABLE_FONT_SIZE);
  setFont(0);
  const height = rowHeight(doc, row, widths, options);
  const top = doc.y;
  const totalWidth = sum(widths);

  if (options.header)
    doc.rect(MARGIN, top, totalWidth, height).fill(HEADER_FILL);
  doc.fillColor('#000000');

  let x = MARGIN;
  row.forEach((value, column) => {
    setFont(column);
    doc.text(pdfText(formatCell(value)), x + CELL_PADDING, top + CELL_PADDING, {
      width: widths[column] - CELL_PADDING * 2,
      align:
        typeof value === 'number' || options.numericColumns?.[column]
          ? 'right'
          : 'left',
    });
    x += widths[column];
  });
  doc
    .moveTo(MARGIN, top + height)
    .lineTo(MARGIN + totalWidth, top + height)
    .lineWidth(0.5)
    .strokeColor(RULE)
    .stroke();
  doc.x = MARGIN;
  doc.y = top + height;
}

function rowHeight(
  doc: Pdf,
  row: ReportCell[],
  widths: number[],
  options: { header?: boolean; boldFirstColumn?: boolean } = {},
): number {
  let max = 0;
  row.forEach((value, column) => {
    doc
      .font(
        options.header || (options.boldFirstColumn && column === 0)
          ? 'Helvetica-Bold'
          : 'Helvetica',
      )
      .fontSize(TABLE_FONT_SIZE);
    const height = doc.heightOfString(pdfText(formatCell(value)), {
      width: widths[column] - CELL_PADDING * 2,
    });
    max = Math.max(max, height);
  });
  return max + CELL_PADDING * 2;
}

/**
 * Every column first gets its longest single word, so words are never split
 * mid-way; the remaining width is shared in proportion to how much more each
 * column needs to show its longest (capped) cell on one line.
 */
function columnWidths(
  doc: Pdf,
  table: ReportTable,
  available: number,
  boldFirstColumn = false,
): number[] {
  const count = Math.max(table.columns.length, table.rows[0]?.length ?? 0);
  const minimum: number[] = [];
  const natural: number[] = [];
  for (let column = 0; column < count; column += 1) {
    let longestLine = 0;
    let longestWord = 0;
    const measure = (text: string, bold: boolean) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(TABLE_FONT_SIZE);
      longestLine = Math.max(longestLine, doc.widthOfString(text));
      for (const word of text.split(/\s+/)) {
        longestWord = Math.max(longestWord, doc.widthOfString(word));
      }
    };
    if (table.columns[column]) measure(pdfText(table.columns[column]), true);
    for (const row of table.rows) {
      measure(
        pdfText(formatCell(row[column] ?? null)),
        boldFirstColumn && column === 0,
      );
    }
    const padding = CELL_PADDING * 2 + 1;
    minimum.push(Math.min(longestWord, MAX_WORD_WIDTH) + padding);
    natural.push(
      Math.max(Math.min(longestLine, MAX_NATURAL_COLUMN_WIDTH), longestWord) +
        padding,
    );
  }

  const naturalTotal = sum(natural);
  if (naturalTotal <= available) return natural;
  const minimumTotal = sum(minimum);
  if (minimumTotal >= available) {
    return minimum.map((width) => (width / minimumTotal) * available);
  }
  const extra = available - minimumTotal;
  const wanted = naturalTotal - minimumTotal;
  return minimum.map(
    (width, column) => width + ((natural[column] - width) / wanted) * extra,
  );
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function ensureSpace(doc: Pdf, height: number): void {
  if (doc.y + height > pageBottom(doc)) doc.addPage();
}

function pageBottom(doc: Pdf): number {
  return doc.page.height - doc.page.margins.bottom;
}

function addPageFooters(doc: Pdf, report: ReportDocument): void {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    const bottomMargin = doc.page.margins.bottom;
    // Writing inside the bottom margin would otherwise start a new page.
    doc.page.margins.bottom = 0;
    const label =
      `BioSphere · ${report.title}${report.confidential ? ' · CONFIDENTIAL' : ''}` +
      ` · Page ${index + 1} of ${range.count}`;
    doc
      .font('Helvetica')
      .fontSize(7.5)
      .fillColor('#666666')
      .text(pdfText(label), MARGIN, doc.page.height - MARGIN - 4, {
        width: doc.page.width - MARGIN * 2,
        align: 'center',
        lineBreak: false,
      });
    doc.page.margins.bottom = bottomMargin;
  }
}

// The built-in PDF fonts only cover Windows-1252; other characters would be
// drawn as the wrong glyph, so they are replaced with '?'.
const WIN_ANSI_EXTRAS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));

export function pdfText(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const supported =
      char === '\n' ||
      (code >= 0x20 && code <= 0x7e) ||
      (code >= 0xa0 && code <= 0xff) ||
      WIN_ANSI_EXTRAS.has(char);
    out += supported ? char : char === '\t' || char === '\r' ? ' ' : '?';
  }
  return out;
}
