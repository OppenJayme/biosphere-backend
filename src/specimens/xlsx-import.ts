import { BadRequestException } from '@nestjs/common';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import { readSheet } from 'read-excel-file/node';

const MAX_EXPANDED_BYTES = 20 * 1024 * 1024;
const MAX_ENTRIES = 128;
const MAX_COLUMNS = 100;
const fail = (message: string): never => {
  throw new BadRequestException(message);
};

/** Restrict sparse coordinates before the reader can allocate padded arrays. */
function checkWorksheet(xml: string, maxRows: number): void {
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
  const attribute = (tag: string, name: string) => {
    const matches = [
      ...tag.matchAll(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'gs')),
    ];
    if (matches.length > 1) fail('The XLSX contains duplicate XML attributes.');
    return matches[0]?.[2];
  };
  let cells = 0;
  let rows = 0;
  for (const [tag, kind] of xml.matchAll(
    /<(?:[^<>\s/:]+:)?(row|c|dimension)\b(?:"[^"]*"|'[^']*'|[^'">])*>/g,
  )) {
    if (kind === 'row') {
      const row = attribute(tag, 'r');
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
    } else if (kind === 'c') {
      const ref = attribute(tag, 'r');
      if (!ref)
        throw new BadRequestException(
          'The XLSX contains a cell without a reference.',
        );
      if (++cells > (maxRows + 1) * MAX_COLUMNS)
        fail('The XLSX cell range is too large.');
      address(ref);
      if (attribute(tag, 't') === 'e')
        fail(
          'Replace spreadsheet error cells with literal values before importing.',
        );
    } else {
      const ref = attribute(tag, 'ref');
      if (ref) ref.split(':').forEach(address);
    }
  }
}

/** No filesystem extraction, formula evaluation or remote workbook references. */
export async function parseXlsxImport(
  buffer: Buffer,
  maxRows: number,
  isAccessionHeader: (header: string) => boolean,
): Promise<Record<string, string>[]> {
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
    for (const [name, data] of Object.entries(files)) {
      if (!/\.(xml|rels)$/i.test(name)) continue;
      const xml = strFromU8(data);
      if (
        /\0|<!DOCTYPE|<!ENTITY|<(?:[^<>\s/:]+:)?f\b|TargetMode\s*=\s*["']External["']/i.test(
          xml,
        )
      ) {
        fail(
          'Use literal values only: formulas, XML entities and external references are not supported in XLSX imports.',
        );
      }
      // Relationship targets may use arbitrary XML paths, not only xl/worksheets.
      checkWorksheet(xml, maxRows);
    }
    // Repackage bounded entries so a second ZIP reader never trusts original size metadata.
    const rows = (await readSheet<{ numeric: string }>(
      Buffer.from(zipSync(files, { level: 0 })),
      'Specimens',
      {
        parseNumber: (numeric) => ({ numeric }),
      },
    )) as unknown[][];
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
            if (
              normalized[i] !== 'collectiondate' ||
              !Number.isFinite(value.getTime()) ||
              value.toISOString().slice(11) !== '00:00:00.000Z'
            ) {
              fail(
                'Use a date-only collection date and text values for other fields.',
              );
            }
            return [header, value.toISOString().slice(0, 10)];
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
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException(
      'The XLSX could not be read. Use a valid workbook with a worksheet named Specimens and literal cell values.',
    );
  }
}
