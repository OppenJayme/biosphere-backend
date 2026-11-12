import { BadRequestException } from '@nestjs/common';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { readSheet, SheetNotFoundError } from 'read-excel-file/node';
import { SaxesParser } from 'saxes';

const MAX_EXPANDED_BYTES = 20 * 1024 * 1024;
const MAX_ENTRIES = 128;
const MAX_COLUMNS = 100;
/** Worksheets the import reads; every other sheet is skipped. */
export const SPECIMENS_SHEET = 'Specimens';
export const LOTS_SHEET = 'Lots';
/** A specimen can have several lots, so the Lots sheet may run longer. */
const LOTS_PER_SPECIMEN = 5;
/**
 * Sheets the import does not read (for example the visitor sheets of a
 * weekly backup workbook) still pass the XML safety checks, with a looser
 * row bound; the 20 MB expanded limit caps them overall.
 */
const OTHER_SHEET_MAX_ROWS = 200_000;
const fail = (message: string): never => {
  throw new BadRequestException(message);
};

/** Restrict sparse coordinates before the reader can allocate padded arrays. */
function checkXmlPart(xml: string, maxRows: number): void {
  const address = (value: string) => {
    const match = /^([A-Z]{1,3})([1-9]\d*)$/.exec(value);
    if (!match) fail('The XLSX contains an invalid cell reference.');
    const column = [...match![1]].reduce(
      (n, c) => n * 26 + c.charCodeAt(0) - 64,
      0,
    );
    if (column > MAX_COLUMNS || Number(match![2]) > maxRows + 1) {
      fail(
        `XLSX sheets must fit within ${maxRows} data rows and ${MAX_COLUMNS} columns. Remove unused formatted rows/columns.`,
      );
    }
  };
  let cells = 0;
  let rows = 0;
  let depth = 0;
  let tags = 0;
  let attributes = 0;
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentagstart', () => {
    attributes = 0;
  });
  parser.on('attribute', () => {
    if (++attributes > 64)
      fail('The XLSX XML has too many attributes on one element.');
  });
  parser.on('closetag', () => {
    depth--;
  });
  parser.on('error', () =>
    fail('The XLSX contains malformed XML or duplicate XML attributes.'),
  );
  parser.on('doctype', () =>
    fail('XML DOCTYPE and entities are not supported in XLSX imports.'),
  );
  parser.on('opentag', (tag) => {
    if (++depth > 64 || ++tags > 250_000)
      fail('The XLSX XML structure exceeds safe nesting or element limits.');
    if (tag.local === 'chartSpace')
      fail('Use a plain data workbook without charts for specimen import.');
    if (tag.local === 'f')
      fail(
        'Use literal values only: formulas are not supported in XLSX imports.',
      );
    if (
      Object.values(tag.attributes).some(
        (attribute) =>
          attribute.local === 'TargetMode' &&
          attribute.value.toLowerCase() === 'external',
      )
    ) {
      fail(
        'Remove external hyperlinks and workbook references before importing XLSX.',
      );
    }
    // Check coordinates regardless of ZIP path or root name: the downstream
    // workbook reader can encounter sheetData even under a nonstandard root.
    // SAX local names distinguish c:chartSpace from actual c (cell) elements.
    if (tag.local === 'row') {
      const row = tag.attributes.r?.value;
      if (
        !row ||
        !/^[1-9]\d*$/.test(row) ||
        Number(row) > maxRows + 1 ||
        ++rows > maxRows + 1
      ) {
        fail(
          `XLSX sheets support at most ${maxRows} data rows plus one header.`,
        );
      }
    } else if (tag.local === 'c') {
      const ref = tag.attributes.r?.value;
      if (!ref)
        throw new BadRequestException(
          'The XLSX contains a cell without a reference.',
        );
      if (++cells > (maxRows + 1) * MAX_COLUMNS)
        fail('The XLSX cell range is too large.');
      address(ref);
      if (tag.attributes.t?.value === 'e')
        fail(
          'Replace spreadsheet error cells with literal values before importing.',
        );
    } else if (tag.local === 'dimension') {
      const ref = tag.attributes.ref?.value;
      if (ref) ref.split(':').forEach(address);
    }
  });
  parser.write(xml).close();
}

export interface XlsxImportSheets {
  specimens: Record<string, string>[];
  /** Rows of a "Lots" sheet (as in a backup workbook), or null if absent. */
  lots: Record<string, string>[] | null;
}

/**
 * Maps each worksheet name to its XML part, so the row limit can be strict
 * for the sheets the import reads and looser for the rest.
 */
function sheetParts(files: Record<string, Uint8Array>): Map<string, string> {
  const parts = new Map<string, string>();
  const workbook = files['xl/workbook.xml'];
  const rels = files['xl/_rels/workbook.xml.rels'];
  if (!workbook || !rels) return parts;
  const targets = new Map<string, string>();
  for (const match of strFromU8(rels).matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(match[0])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(match[0])?.[1];
    if (id && target) {
      targets.set(
        id,
        target.startsWith('/') ? target.slice(1) : `xl/${target}`,
      );
    }
  }
  for (const match of strFromU8(workbook).matchAll(/<sheet\b[^>]*>/g)) {
    const name = /\bname="([^"]+)"/.exec(match[0])?.[1];
    const id = /\br:id="([^"]+)"/.exec(match[0])?.[1];
    const part = id ? targets.get(id) : undefined;
    if (name && part) parts.set(part, name);
  }
  return parts;
}

/** No filesystem extraction, formula evaluation or remote workbook references. */
export async function parseXlsxImport(
  buffer: Buffer,
  maxRows: number,
  isAccessionHeader: (header: string) => boolean,
): Promise<XlsxImportSheets> {
  try {
    let expanded = 0;
    const seen = new Set<string>();
    const files = unzipSync(buffer, {
      filter(entry) {
        if (
          seen.has(entry.name) ||
          seen.size >= MAX_ENTRIES ||
          /(?:^|\/)\.\.(?:\/|$)|\\|^\/|__proto__/.test(entry.name)
        ) {
          fail('The XLSX archive has duplicate, unsafe or too many entries.');
        }
        seen.add(entry.name);
        if (
          !Number.isSafeInteger(entry.originalSize) ||
          entry.originalSize < 0 ||
          !Number.isSafeInteger(entry.size) ||
          entry.size < 0 ||
          (entry.compression === 0 && entry.size !== entry.originalSize)
        ) {
          fail('The XLSX archive has invalid entry sizes.');
        }
        expanded += entry.originalSize;
        if (expanded > MAX_EXPANDED_BYTES)
          fail('The XLSX exceeds the 20 MB expanded workbook limit.');
        if (/vbaProject|externalLinks|embeddings|activeX/i.test(entry.name)) {
          fail(
            'Use a plain XLSX workbook without macros, embedded objects or external links.',
          );
        }
        return true;
      },
    });
    if (!files['xl/workbook.xml'] || !files['[Content_Types].xml'])
      fail('Upload a valid XLSX workbook.');
    const sheetNames = sheetParts(files);
    for (const [name, data] of Object.entries(files)) {
      if (!/\.(xml|rels)$/i.test(name)) continue;
      const xml = strFromU8(data);
      const sheet = sheetNames.get(name);
      checkXmlPart(
        xml,
        sheet === undefined || sheet === SPECIMENS_SHEET
          ? maxRows
          : sheet === LOTS_SHEET
            ? maxRows * LOTS_PER_SPECIMEN
            : OTHER_SHEET_MAX_ROWS,
      );
    }
    // Repackage bounded entries so a second ZIP reader never trusts original size metadata.
    const workbook = Buffer.from(zipSync(files, { level: 0 }));
    const read = async (sheet: string) =>
      (await readSheet<{ numeric: string }>(workbook, sheet, {
        parseNumber: (numeric) => ({ numeric }),
      })) as unknown[][];
    const specimens = toRecords(await read(SPECIMENS_SHEET), isAccessionHeader);
    let lots: Record<string, string>[] | null = null;
    try {
      lots = toRecords(await read(LOTS_SHEET), () => false);
    } catch (error) {
      if (!(error instanceof SheetNotFoundError)) throw error;
    }
    return { specimens, lots };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(
      `The XLSX could not be read. Use a valid workbook with a worksheet named ${SPECIMENS_SHEET} and literal cell values.`,
    );
  }
}

/** Header row plus data rows to records keyed by header, as text. */
function toRecords(
  rows: unknown[][],
  isAccessionHeader: (header: string) => boolean,
): Record<string, string>[] {
  if (!rows.length) return [];
  const headers = rows[0].map((value) => {
    if (typeof value !== 'string' || !value.trim())
      fail('XLSX headers must be non-empty text values.');
    return (value as string).trim();
  });
  const normalized = headers.map((h) =>
    h.toLowerCase().replace(/[\s_-]+/g, ''),
  );
  if (new Set(normalized).size !== headers.length)
    fail('The XLSX contains duplicate column headers.');
  return rows.slice(1).map((row) => {
    if (
      row.length > headers.length &&
      row.slice(headers.length).some((value) => value != null)
    ) {
      fail('Every XLSX data column needs a header.');
    }
    return Object.fromEntries(
      headers.map((header, i) => {
        const value = row[i];
        if (value == null) return [header, ''];
        if (typeof value === 'string' || typeof value === 'boolean')
          return [header, String(value)];
        if (value instanceof Date) {
          if (!Number.isFinite(value.getTime()))
            fail('The XLSX contains an invalid date.');
          // Excel stores dates without a time zone; the reader returns
          // them as UTC midnight, so the date part is the cell's date.
          const iso = value.toISOString();
          return [
            header,
            iso.slice(11) === '00:00:00.000Z' ? iso.slice(0, 10) : iso,
          ];
        }
        if (
          typeof value === 'object' &&
          'numeric' in value &&
          typeof value.numeric === 'string'
        ) {
          if (isAccessionHeader(header))
            fail(
              'Format accession numbers as Text in Excel to preserve leading zeros.',
            );
          return [header, value.numeric];
        }
        return fail('The XLSX contains an unsupported cell value.');
      }),
    );
  });
}
