import { inflateRawSync, inflateSync } from 'node:zlib';
import type { ReportDocument } from '../report-document';
import { renderCsv } from './csv.renderer';
import { renderDocx } from './docx.renderer';
import { pdfText, renderPdf } from './pdf.renderer';
import { MIN_REPORT_FONT_SIZE } from './render-helpers';

const report: ReportDocument = {
  title: 'Inventory Report',
  periodLabel: 'September 2026',
  generatedAt: new Date('2026-09-30T01:00:00.000Z'),
  generatedBy: 'Test Curator',
  confidential: true,
  rowCount: 1,
  blocks: [
    { kind: 'heading', text: 'Summary' },
    { kind: 'paragraph', text: 'Line one\nLine two' },
    { kind: 'keyValues', items: [{ label: 'Specimens', value: 1 }] },
    {
      kind: 'table',
      table: {
        title: 'Details',
        columns: ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
        rows: [
          ['Stacked one\nStacked two', 1, null, 'y', 'z', 'w', 'Señor Búho'],
        ],
      },
    },
    { kind: 'table', table: { title: 'Empty', columns: ['A'], rows: [] } },
  ],
};

describe('report renderers', () => {
  describe('renderCsv', () => {
    it('writes a BOM, CRLF lines, and RFC 4180 quoting', () => {
      const csv = renderCsv({
        columns: ['Name', 'Note'],
        rows: [
          ['Org, Inc.', 'Said "hi"'],
          [null, 42],
        ],
      }).toString('utf8');

      expect(csv.charCodeAt(0)).toBe(0xfeff);
      expect(csv.slice(1)).toBe(
        'Name,Note\r\n"Org, Inc.","Said ""hi"""\r\n,42\r\n',
      );
    });

    it('neutralizes spreadsheet formulas', () => {
      const csv = renderCsv({
        columns: ['Value'],
        rows: [['=HYPERLINK("x")'], ['+1'], ['@SUM(A1)'], [-5]],
      }).toString('utf8');

      expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
      expect(csv).toContain(`'+1`);
      expect(csv).toContain(`'@SUM(A1)`);
      // Real numbers are left alone.
      expect(csv).toContain('\r\n-5\r\n');
    });
  });

  describe('renderPdf', () => {
    let pdf: Buffer;
    let content: string;

    beforeAll(async () => {
      pdf = await renderPdf(report);
      content = pdfStreams(pdf);
    });

    it('renders a PDF', () => {
      expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    });

    it('uses portrait A4 pages even for a seven-column table', () => {
      const boxes = [
        ...pdf
          .toString('latin1')
          .matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g),
      ];
      expect(boxes.length).toBeGreaterThan(0);
      for (const [, width, height] of boxes) {
        expect(Math.round(Number(width))).toBe(595);
        expect(Math.round(Number(height))).toBe(842);
      }
    });

    it('sets no text below 12 pt, including table cells and page footers', () => {
      const sizes = [...content.matchAll(/\/F\d+ ([\d.]+) Tf/g)].map(
        ([, size]) => Number(size),
      );
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_REPORT_FONT_SIZE);
    });

    it('draws both letterhead logos', () => {
      const images = pdf.toString('latin1').match(/\/Subtype \/Image/g) ?? [];
      expect(images.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('renderDocx', () => {
    let parts: Map<string, Buffer>;

    beforeAll(async () => {
      parts = unzip(await renderDocx(report));
    });

    it('uses a portrait A4 page', () => {
      const xml = parts.get('word/document.xml')!.toString('utf8');
      const [, width, height] = /<w:pgSz w:w="(\d+)" w:h="(\d+)"/.exec(xml)!;
      expect(Number(width)).toBe(11906);
      expect(Number(height)).toBe(16838);
      expect(xml).not.toContain('w:orient="landscape"');
    });

    it('sets no text below 12 pt in the body, header, footer, or styles', () => {
      const sizes: number[] = [];
      for (const [name, data] of parts) {
        if (!/^word\/(document|header\d*|footer\d*|styles)\.xml$/.test(name))
          continue;
        for (const [, halfPoints] of data
          .toString('utf8')
          .matchAll(/<w:sz w:val="(\d+)"/g)) {
          sizes.push(Number(halfPoints) / 2);
        }
      }
      expect(sizes.length).toBeGreaterThan(0);
      expect(Math.min(...sizes)).toBeGreaterThanOrEqual(MIN_REPORT_FONT_SIZE);
    });

    it('embeds both letterhead logos', () => {
      const media = [...parts.keys()].filter((name) =>
        /^word\/media\/.+\.png$/.test(name),
      );
      expect(media).toHaveLength(2);
    });

    it('prints each stacked field on its own line', () => {
      const xml = parts.get('word/document.xml')!.toString('utf8');
      expect(xml).toMatch(
        />Stacked one<\/w:t>.*?<\/w:p>.*?>Stacked two<\/w:t>/s,
      );
    });
  });

  it('replaces characters the built-in PDF fonts cannot draw', () => {
    expect(pdfText('Señor – “ok” ₱100 🦋\tx')).toBe('Señor – “ok” ?100 ? x');
  });
});

/** Decompressed content of every Flate stream in a PDF, joined. */
function pdfStreams(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const out: string[] = [];
  const pattern = /(?<!end)stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    const start = match.index + match[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    try {
      out.push(inflateSync(pdf.subarray(start, end)).toString('latin1'));
    } catch {
      // Not a Flate stream.
    }
    pattern.lastIndex = end + 'endstream'.length;
  }
  return out.join('\n');
}

/** Reads every entry of a zip file through its central directory. */
function unzip(zip: Buffer): Map<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let offset = zip.readUInt32LE(end + 16);
  const entries = new Map<string, Buffer>();
  for (let index = 0; index < count; index += 1) {
    const method = zip.readUInt16LE(offset + 10);
    const size = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const local = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);
    const dataStart =
      local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(dataStart, dataStart + size);
    entries.set(name, method === 8 ? inflateRawSync(data) : data);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
