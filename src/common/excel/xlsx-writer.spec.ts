import { strFromU8, unzipSync } from 'fflate';
import { readSheet } from 'read-excel-file/node';
import {
  buildXlsx,
  columnName,
  MAX_CELL_CHARS,
  TRUNCATION_MARK,
} from './xlsx-writer';

describe('xlsx writer', () => {
  it('round-trips text, numbers, blanks and non-ASCII text', async () => {
    const { body } = buildXlsx([
      {
        name: 'People',
        header: ['Name', 'Count', 'Note'],
        rows: [
          ['Niño Peña – “Café”', 3, null],
          ['Line one\nline two', 0, '  padded  '],
        ],
      },
    ]);
    const rows = await readSheet(body, 'People');
    expect(rows).toEqual([
      ['Name', 'Count', 'Note'],
      ['Niño Peña – “Café”', 3, null],
      ['Line one\nline two', 0, 'padded'],
    ]);
    // The reader trims; the file itself keeps the spaces.
    const xml = strFromU8(unzipSync(body)['xl/worksheets/sheet1.xml']);
    expect(xml).toContain('<t xml:space="preserve">  padded  </t>');
  });

  it('stores formula-like text as quoted text, unchanged', async () => {
    const { body } = buildXlsx([
      {
        name: 'S',
        header: ['Message'],
        rows: [['=HYPERLINK("http://x","y")'], ['+1'], ['@me'], ['ok']],
      },
    ]);
    const xml = strFromU8(unzipSync(body)['xl/worksheets/sheet1.xml']);
    expect(xml).not.toContain('<f>');
    expect((xml.match(/ s="2"/g) ?? []).length).toBe(3);
    const rows = await readSheet(body, 'S');
    expect(rows[1][0]).toBe('=HYPERLINK("http://x","y")');
    expect(strFromU8(unzipSync(body)['xl/styles.xml'])).toContain(
      'quotePrefix="1"',
    );
  });

  it('cuts cells over the Excel limit and counts them per sheet', async () => {
    const long = 'a'.repeat(MAX_CELL_CHARS + 10);
    const { body, truncated } = buildXlsx([
      { name: 'A', header: ['x'], rows: [[long], ['short']] },
      { name: 'B', header: ['x'], rows: [['short']] },
    ]);
    expect(truncated).toEqual({ A: 1, B: 0 });
    const cell = (await readSheet(body, 'A'))[1][0] as string;
    expect(cell).toHaveLength(MAX_CELL_CHARS);
    expect(cell.endsWith(TRUNCATION_MARK)).toBe(true);
  });

  it('drops characters XML cannot hold and escapes markup', async () => {
    const { body } = buildXlsx([
      { name: 'S', header: ['x'], rows: [['a\u0001b <c> & "d"']] },
    ]);
    expect((await readSheet(body, 'S'))[1][0]).toBe('ab <c> & "d"');
  });

  it('freezes the header row and contains no macros', () => {
    const files = unzipSync(
      buildXlsx([{ name: 'S', header: ['x'], rows: [] }]).body,
    );
    expect(strFromU8(files['xl/worksheets/sheet1.xml'])).toContain(
      'state="frozen"',
    );
    expect(Object.keys(files).some((f) => /vba|macro/i.test(f))).toBe(false);
  });

  it('rejects invalid and duplicate sheet names', () => {
    expect(() => buildXlsx([{ name: 'a/b', header: [], rows: [] }])).toThrow();
    expect(() =>
      buildXlsx([
        { name: 'Same', header: [], rows: [] },
        { name: 'same', header: [], rows: [] },
      ]),
    ).toThrow();
  });

  it('names columns past Z', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnName)).toEqual([
      'A',
      'Z',
      'AA',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });
});
