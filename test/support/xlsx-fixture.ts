import { strToU8, zipSync } from 'fflate';

type FixtureCell = string | number | { xml: string };
const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

/** Small literal OOXML packages; independent of the production workbook reader. */
export function xlsxFixture(
  sheets: Record<string, FixtureCell[][]>,
  extraEntries: Record<string, Uint8Array> = {},
): Buffer {
  const names = Object.keys(sheets);
  const entries: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    ),
    '_rels/.rels': strToU8(
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
    ),
  };
  names.forEach((name, i) => {
    entries[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(
      `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheets[
        name
      ]
        .map(
          (row, r) =>
            `<row r="${r + 1}">${row
              .map((value, c) => {
                const ref = `${String.fromCharCode(65 + c)}${r + 1}`;
                if (typeof value === 'number')
                  return `<c r="${ref}"><v>${value}</v></c>`;
                if (typeof value === 'object')
                  return `<c r="${ref}">${value.xml}</c>`;
                return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
              })
              .join('')}</row>`,
        )
        .join('')}</sheetData></worksheet>`,
    );
  });
  return Buffer.from(zipSync({ ...entries, ...extraEntries }));
}
