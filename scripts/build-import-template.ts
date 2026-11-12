// Writes the specimen import template workbook to the given path, e.g.
//   npm run build:import-template -- ../biosphere-frontend/public/templates/specimen-import-template.xlsx
import { writeFileSync } from 'node:fs';
import { buildImportTemplate } from '../src/specimens/import-template';

const target = process.argv[2];
if (!target) {
  console.error('Usage: npm run build:import-template -- <output.xlsx>');
  process.exit(1);
}
writeFileSync(target, buildImportTemplate());
console.log(`Wrote ${target}`);
