import {
  AlignmentType,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
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
import { formatGeneratedAt, usesLandscape } from './render-helpers';

// Sizes are in half-points (docx convention).
const BODY_SIZE = 20;
const TABLE_SIZE = 16;
const HEADER_FILL = 'E3EEE6';

/**
 * Editable Word document (REQ-4.7-11, REQ-4.7-16). The file is a standalone
 * export: editing it never touches BioSphere records.
 */
export async function renderDocx(report: ReportDocument): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: report.title, heading: HeadingLevel.TITLE }),
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

  const document = new Document({
    creator: 'BioSphere',
    title: report.title,
    description: `${report.title}: ${report.periodLabel}`,
    styles: {
      default: { document: { run: { font: 'Calibri', size: BODY_SIZE } } },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: usesLandscape(report)
                ? PageOrientation.LANDSCAPE
                : PageOrientation.PORTRAIT,
            },
            margin: { top: 1000, bottom: 1000, left: 900, right: 900 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: `BioSphere · ${report.title}${report.confidential ? ' · CONFIDENTIAL' : ''}`,
                    size: 16,
                    color: '666666',
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
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
                    size: 16,
                    color: '666666',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  return Packer.toBuffer(document);
}

function renderBlock(block: ReportBlock): (Paragraph | Table)[] {
  switch (block.kind) {
    case 'heading':
      return [
        new Paragraph({
          text: block.text,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 320, after: 120 },
        }),
      ];
    case 'paragraph':
      return block.text.split(/\r?\n/).map((line) => bodyText(line));
    case 'keyValues':
      return [
        new Table({
          width: { size: 70, type: WidthType.PERCENTAGE },
          rows: block.items.map(
            (item) =>
              new TableRow({
                children: [cell(item.label, { bold: true }), cell(item.value)],
              }),
          ),
        }),
        spacer(),
      ];
    case 'table':
      return renderTable(block.table);
  }
}

function renderTable(table: ReportTable): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  if (table.title) {
    out.push(
      new Paragraph({
        text: table.title,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
      }),
    );
  }
  if (table.rows.length === 0) {
    out.push(bodyText('No records for this selection.'));
    return out;
  }
  out.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: table.columns.map((column, index) =>
            cell(column, {
              bold: true,
              fill: HEADER_FILL,
              alignRight: typeof table.rows[0][index] === 'number',
            }),
          ),
        }),
        ...table.rows.map(
          (row) => new TableRow({ children: row.map((value) => cell(value)) }),
        ),
      ],
    }),
    spacer(),
  );
  return out;
}

function cell(
  value: ReportCell,
  options: { bold?: boolean; fill?: string; alignRight?: boolean } = {},
): TableCell {
  return new TableCell({
    shading: options.fill
      ? { type: ShadingType.CLEAR, fill: options.fill, color: 'auto' }
      : undefined,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment:
          typeof value === 'number' || options.alignRight
            ? AlignmentType.RIGHT
            : AlignmentType.LEFT,
        children: [
          new TextRun({
            text: formatCell(value),
            bold: options.bold,
            size: TABLE_SIZE,
          }),
        ],
      }),
    ],
  });
}

function bodyText(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, size: BODY_SIZE })] });
}

function spacer(): Paragraph {
  return new Paragraph({ text: '' });
}
