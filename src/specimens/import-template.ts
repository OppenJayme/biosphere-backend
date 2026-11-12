import { buildXlsx } from '../common/excel/xlsx-writer';
import { SPECIMENS_SHEET } from './xlsx-import';

/**
 * The downloadable specimen import template (Excel only, 2026-11-12): the
 * minimum columns a curator needs to finish a record, plus an Instructions
 * sheet the import ignores. Regenerate the frontend copy with
 * `npm run build:import-template -- <path>` after changing it.
 */
export const IMPORT_TEMPLATE_COLUMNS: { header: string; help: string }[] = [
  {
    header: 'Accession Number',
    help: 'Leave blank to get the next USC-BM number. Kept as text, so leading zeros stay.',
  },
  {
    header: 'Common Name',
    help: 'A common name or a scientific name is required on every row.',
  },
  {
    header: 'Scientific Name',
    help: 'A common name or a scientific name is required on every row.',
  },
  { header: 'Specimen Category', help: 'For example Mammal or Insect.' },
  {
    header: 'Collection',
    help: 'The collection name exactly as it appears in BioSphere. If it is not found, the record is imported without one.',
  },
  { header: 'Kingdom', help: 'For example Animalia.' },
  {
    header: 'Collection Date',
    help: 'YYYY-MM-DD (for example 2026-03-14) or an Excel date. Not in the future.',
  },
  { header: 'Preservation Type', help: 'For example Dry or Wet.' },
  { header: 'Preservation Method', help: 'For example Skin mount.' },
  {
    header: 'Storage Unit',
    help: 'Where the specimens are kept, from the room down, for example Zoology Room > Cabinet A > Drawer 1.',
  },
  {
    header: 'Condition',
    help: 'Excellent, Good, Fair, Poor or Critical.',
  },
  { header: 'Quantity', help: 'A whole number, at least 1.' },
  { header: 'Remarks', help: 'Anything that does not fit another column.' },
];

const GENERAL_NOTES: [string, string][] = [
  [
    'Sheet',
    `Enter specimens on the "${SPECIMENS_SHEET}" sheet only. This sheet is not imported.`,
  ],
  [
    'Required',
    'Each row needs a common name or a scientific name. Nothing else is required.',
  ],
  [
    'Blank or unusable values',
    'They are left blank, with a warning in the preview. The record is saved as Uncataloged so you can finish it in BioSphere.',
  ],
  [
    'Lots',
    'Storage Unit, Condition and Quantity together create the first lot. If one is missing, the specimen is still imported without the lot.',
  ],
  ['Rows', 'Up to 500 rows per file, 5 MB at most.'],
  [
    'Backups',
    'A weekly backup workbook from Backup History can be imported as it is.',
  ],
];

export function buildImportTemplate(): Buffer {
  return buildXlsx([
    {
      name: SPECIMENS_SHEET,
      header: IMPORT_TEMPLATE_COLUMNS.map((column) => column.header),
      rows: [],
      textColumns: [0],
    },
    {
      name: 'Instructions',
      header: ['Column or topic', 'What to enter'],
      rows: [
        ...IMPORT_TEMPLATE_COLUMNS.map((column) => [
          column.header,
          column.help,
        ]),
        [null, null],
        ...GENERAL_NOTES,
      ],
    },
  ]).body;
}
