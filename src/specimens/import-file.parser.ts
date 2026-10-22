import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import ExcelJS from 'exceljs';

export type ImportFileRecord = Record<string, string>;

export const SUPPORTED_IMPORT_EXTENSIONS = ['.csv', '.xlsx'] as const;

/**
 * Turns an uploaded CSV or Excel workbook into header-keyed text records.
 * For a workbook, the first worksheet is read and its first non-empty row is
 * the header row, matching the CSV template. Every cell becomes trimmed text
 * so both formats go through the same row validation; Excel dates become
 * `YYYY-MM-DD`, formulas contribute their cached result.
 */
export async function parseImportFile(
  file: Express.Multer.File | undefined,
): Promise<ImportFileRecord[]> {
  if (!file) {
    throw new BadRequestException('A CSV or Excel (.xlsx) file is required.');
  }
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.csv')) return parseCsv(file.buffer);
  if (name.endsWith('.xlsx')) return parseWorkbook(file.buffer);
  throw new BadRequestException(
    'Only .csv and Excel .xlsx files are supported for import. Save older .xls files as .xlsx first.',
  );
}

function parseCsv(buffer: Buffer): ImportFileRecord[] {
  try {
    return parse(buffer.toString('utf8'), {
      columns: true,
      bom: true,
      trim: true,
      skip_empty_lines: true,
    }) as ImportFileRecord[];
  } catch (error) {
    throw new BadRequestException(
      `The uploaded file could not be parsed as CSV: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }
}

async function parseWorkbook(buffer: Buffer): Promise<ImportFileRecord[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch (error) {
    throw new BadRequestException(
      `The uploaded file could not be read as an Excel workbook: ${
        error instanceof Error ? error.message : 'unknown error'
      }`,
    );
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new BadRequestException('The Excel workbook has no worksheets.');
  }

  let headers: string[] | null = null;
  const records: ImportFileRecord[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = [];
    for (let column = 1; column <= row.cellCount; column += 1) {
      values[column - 1] = cellText(row.getCell(column).value);
    }
    if (values.every((value) => value === '')) return;
    if (headers === null) {
      headers = values;
      return;
    }
    const record: ImportFileRecord = {};
    headers.forEach((header, index) => {
      if (header !== '') record[header] = values[index] ?? '';
    });
    records.push(record);
  });

  if (headers === null) {
    throw new BadRequestException('The Excel worksheet has no header row.');
  }
  return records;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) {
      return value.richText
        .map((part) => part.text)
        .join('')
        .trim();
    }
    if ('result' in value) return cellText(value.result);
    if ('text' in value) return String(value.text).trim();
    // Errors and other cell objects carry no usable text.
    return '';
  }
  return String(value).trim();
}
