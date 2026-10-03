import type { ReportDocument } from '../report-document';
import { renderCsv } from './csv.renderer';
import { renderDocx } from './docx.renderer';
import { pdfText, renderPdf } from './pdf.renderer';

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
        rows: [['x', 1, null, 'y', 'z', 'w', 'Señor Búho']],
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

  it('renders a PDF', async () => {
    const pdf = await renderPdf(report);

    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('renders a DOCX (zip) document', async () => {
    const docx = await renderDocx(report);

    expect(docx.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('replaces characters the built-in PDF fonts cannot draw', () => {
    expect(pdfText('Señor – “ok” ₱100 🦋\tx')).toBe('Señor – “ok” ?100 ? x');
  });
});
