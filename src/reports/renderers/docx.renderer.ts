import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableBorders,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from 'docx';
import {
  CONFIDENTIAL_NOTICE,
  formatCell,
  type ReportBlock,
  type ReportCell,
  type ReportDocument,
  type ReportTable,
} from '../report-document';
import {
  formatGeneratedAt,
  MIN_REPORT_FONT_SIZE,
  pngAspectRatio,
  REPORT_INSTITUTION,
  REPORT_MUSEUM,
  reportLogos,
} from './render-helpers';

// Sizes are in half-points (docx convention); none is below 12 pt.
const BODY_SIZE = MIN_REPORT_FONT_SIZE * 2;
const TABLE_SIZE = MIN_REPORT_FONT_SIZE * 2;
const HEADER_FILL = 'E3EEE6';
const BRAND = '1F5130';
const LOGO_HEIGHT_PX = 80;
// A4 portrait in twips.
const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const SIDE_MARGIN = 850;
const CONTENT_WIDTH = PAGE_WIDTH - SIDE_MARGIN * 2;
// Column sizing estimates: an average lowercase 12 pt Calibri character is
// about 115 twips wide, plus the cell's left and right margins.
const CHAR_WIDTH = 115;
const CELL_SIDES = 220;
const MAX_WORD_CHARS = 24;
const MAX_LINE_CHARS = 34;
const KEEP_TOGETHER_ROWS = 15;

/**
 * Editable Word document (REQ-4.7-11, REQ-4.7-16). The file is a standalone
 * export: editing it never touches BioSphere records.
 */
export async function renderDocx(report: ReportDocument): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    letterhead(),
    new Paragraph({
      text: report.title,
      heading: HeadingLevel.TITLE,
      spacing: { before: 240 },
    }),
    bodyText(`Reporting period: ${report.periodLabel}`),
    bodyText(
      `Generated ${formatGeneratedAt(report.generatedAt)} by ${report.generatedBy}`,
    ),
  ];
  if (report.confidential) {
    children.push(
      new Paragraph({
        spacing: { before: 120 },
        children: [
          new TextRun({
            text: CONFIDENTIAL_NOTICE,
            bold: true,
            color: '9B1C1C',
            size: BODY_SIZE,
          }),
        ],
      }),
    );
  }
  for (const block of report.blocks) children.push(...renderBlock(block));

  const runningHeader = new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({
            text: `BioSphere · ${report.title}${report.confidential ? ' · CONFIDENTIAL' : ''}`,
            size: BODY_SIZE,
            color: '555555',
          }),
        ],
      }),
    ],
  });
  const pageFooter = new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            children: [
              'Page ',
              PageNumber.CURRENT,
              ' of ',
              PageNumber.TOTAL_PAGES,
            ],
            size: BODY_SIZE,
            color: '555555',
          }),
        ],
      }),
    ],
  });

  const document = new Document({
    creator: 'BioSphere',
    title: report.title,
    description: `${report.title}: ${report.periodLabel}`,
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: BODY_SIZE } },
        title: { run: { size: 40, bold: true, color: BRAND } },
        heading1: { run: { size: 30, bold: true, color: BRAND } },
        heading2: { run: { size: 26, bold: true, color: '222222' } },
        // Word's 10 pt note styles would apply to notes a curator adds later.
        footnoteText: { run: { size: BODY_SIZE } },
        footnoteTextChar: { run: { size: BODY_SIZE } },
        endnoteText: { run: { size: BODY_SIZE } },
        endnoteTextChar: { run: { size: BODY_SIZE } },
      },
    },
    sections: [
      {
        properties: {
          // The letterhead replaces the running header on the first page.
          titlePage: true,
          page: {
            size: {
              width: PAGE_WIDTH,
              height: PAGE_HEIGHT,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: 900,
              bottom: 900,
              left: SIDE_MARGIN,
              right: SIDE_MARGIN,
            },
          },
        },
        headers: {
          first: new Header({ children: [new Paragraph({ text: '' })] }),
          default: runningHeader,
        },
        footers: { first: pageFooter, default: pageFooter },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

/**
 * University of San Carlos seal on the left, the BioSphere logo on the right,
 * and the institution between them, laid out in a borderless table.
 */
function letterhead(): Table {
  const { university, biosphere } = reportLogos();
  const logoCell = (
    data: Buffer,
    alignment: (typeof AlignmentType)[keyof typeof AlignmentType],
  ) =>
    new TableCell({
      width: { size: 20, type: WidthType.PERCENTAGE },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({
          alignment,
          children: [
            new ImageRun({
              type: 'png',
              data,
              transformation: {
                width: Math.round(LOGO_HEIGHT_PX * pngAspectRatio(data)),
                height: LOGO_HEIGHT_PX,
              },
            }),
          ],
        }),
      ],
    });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      ...TableBorders.NONE,
      bottom: { style: BorderStyle.SINGLE, size: 12, color: BRAND },
    },
    rows: [
      new TableRow({
        children: [
          logoCell(university, AlignmentType.LEFT),
          new TableCell({
            width: { size: 60, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: REPORT_INSTITUTION,
                    bold: true,
                    size: 32,
                    color: BRAND,
                  }),
                ],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: REPORT_MUSEUM,
                    size: 28,
                    color: '333333',
                  }),
                ],
              }),
            ],
          }),
          logoCell(biosphere, AlignmentType.RIGHT),
        ],
      }),
    ],
  });
}

function renderBlock(block: ReportBlock): (Paragraph | Table)[] {
  switch (block.kind) {
    case 'heading':
      return [
        new Paragraph({
          text: block.text,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 320, after: 120 },
          keepNext: true,
        }),
      ];
    case 'paragraph':
      return block.text.split(/\r?\n/).map((line) => bodyText(line));
    case 'keyValues': {
      const rows = block.items.map((item): ReportCell[] => [
        item.label,
        item.value,
      ]);
      const widths = columnWidths([], rows, CONTENT_WIDTH * 0.75);
      return [
        new Table({
          width: { size: sum(widths), type: WidthType.DXA },
          columnWidths: widths,
          layout: TableLayoutType.FIXED,
          rows: rows.map(
            ([label, value], index) =>
              new TableRow({
                cantSplit: true,
                children: [
                  cell(label, {
                    bold: true,
                    width: widths[0],
                    keepNext: index < rows.length - 1,
                  }),
                  cell(value, {
                    width: widths[1],
                    keepNext: index < rows.length - 1,
                  }),
                ],
              }),
          ),
        }),
        spacer(),
      ];
    }
    case 'table':
      return renderTable(block.table);
  }
}

function renderTable(table: ReportTable): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  // Short tables are kept on one page with their title.
  const keepTogether = table.rows.length <= KEEP_TOGETHER_ROWS;
  if (table.title) {
    out.push(
      new Paragraph({
        text: table.title,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
        keepNext: true,
      }),
    );
  }
  if (table.rows.length === 0) {
    out.push(bodyText('No records for this selection.'));
    return out;
  }
  const widths = columnWidths(table.columns, table.rows, CONTENT_WIDTH);
  out.push(
    new Table({
      width: { size: sum(widths), type: WidthType.DXA },
      columnWidths: widths,
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: table.columns.map((column, index) =>
            cell(column, {
              bold: true,
              fill: HEADER_FILL,
              alignRight: typeof table.rows[0][index] === 'number',
              width: widths[index],
              keepNext: true,
            }),
          ),
        }),
        ...table.rows.map(
          (row, rowIndex) =>
            new TableRow({
              cantSplit: true,
              children: row.map((value, index) =>
                cell(value, {
                  width: widths[index],
                  keepNext: keepTogether && rowIndex < table.rows.length - 1,
                }),
              ),
            }),
        ),
      ],
    }),
    spacer(),
  );
  return out;
}

/**
 * Column widths in twips, sized to content like the PDF tables: every column
 * fits its longest word, and the rest of the width goes to columns in
 * proportion to how much more they need to show their longest line.
 */
function columnWidths(
  columns: string[],
  rows: ReportCell[][],
  available: number,
): number[] {
  const count = Math.max(columns.length, rows[0]?.length ?? 0);
  const minimum: number[] = [];
  const natural: number[] = [];
  for (let column = 0; column < count; column += 1) {
    let longestLine = 0;
    let longestWord = 0;
    const texts = [
      columns[column] ?? '',
      ...rows.map((row) => formatCell(row[column] ?? null)),
    ];
    for (const line of texts.flatMap((text) => text.split('\n'))) {
      longestLine = Math.max(longestLine, textUnits(line));
      for (const word of line.split(/\s+/)) {
        longestWord = Math.max(longestWord, textUnits(word));
      }
    }
    minimum.push(
      Math.min(longestWord, MAX_WORD_CHARS) * CHAR_WIDTH + CELL_SIDES,
    );
    natural.push(
      Math.max(Math.min(longestLine, MAX_LINE_CHARS), longestWord) *
        CHAR_WIDTH +
        CELL_SIDES,
    );
  }

  const naturalTotal = sum(natural);
  if (naturalTotal <= available) return natural.map(Math.round);
  const minimumTotal = sum(minimum);
  if (minimumTotal >= available) {
    return minimum.map((width) =>
      Math.floor((width / minimumTotal) * available),
    );
  }
  const extra = available - minimumTotal;
  const wanted = naturalTotal - minimumTotal;
  return minimum.map((width, column) =>
    Math.floor(width + ((natural[column] - width) / wanted) * extra),
  );
}

/** Approximate width in average characters; capitals and digits run wider. */
function textUnits(text: string): number {
  let units = 0;
  for (const char of text) units += /[\p{Lu}\d]/u.test(char) ? 1.35 : 1;
  return units;
}

function cell(
  value: ReportCell,
  options: {
    bold?: boolean;
    fill?: string;
    alignRight?: boolean;
    width?: number;
    keepNext?: boolean;
  } = {},
): TableCell {
  const alignment =
    typeof value === 'number' || options.alignRight
      ? AlignmentType.RIGHT
      : AlignmentType.LEFT;
  return new TableCell({
    width:
      options.width === undefined
        ? undefined
        : { size: options.width, type: WidthType.DXA },
    shading: options.fill
      ? { type: ShadingType.CLEAR, fill: options.fill, color: 'auto' }
      : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    // Stacked cells hold one field per line.
    children: formatCell(value)
      .split('\n')
      .map(
        (line) =>
          new Paragraph({
            alignment,
            keepNext: options.keepNext,
            children: [
              new TextRun({ text: line, bold: options.bold, size: TABLE_SIZE }),
            ],
          }),
      ),
  });
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function bodyText(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, size: BODY_SIZE })] });
}

function spacer(): Paragraph {
  return new Paragraph({ text: '' });
}
