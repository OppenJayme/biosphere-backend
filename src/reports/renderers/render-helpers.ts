import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPORT_TIMEZONE } from '../report-period';

const GENERATED_AT = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: REPORT_TIMEZONE,
});

export function formatGeneratedAt(date: Date): string {
  return `${GENERATED_AT.format(date)} (PHT)`;
}

/**
 * Report readability floor for the museum's staff: no printed text, including
 * table cells, footers, and page numbers, is set smaller than this (points).
 */
export const MIN_REPORT_FONT_SIZE = 12;

export const REPORT_INSTITUTION = 'University of San Carlos';
export const REPORT_MUSEUM = 'USC Biological Museum';

export interface ReportLogos {
  /** University of San Carlos seal, printed on the left of the letterhead. */
  university: Buffer;
  /** BioSphere logo, printed on the right of the letterhead. */
  biosphere: Buffer;
}

// `assets/` sits at the repository root, three levels above this file both in
// `src/reports/renderers` and in the compiled `dist/reports/renderers`.
const LOGO_DIRECTORY = join(__dirname, '..', '..', '..', 'assets', 'reports');

let logos: ReportLogos | undefined;

/** Letterhead logos (both 8-bit PNG), read once and kept in memory. */
export function reportLogos(): ReportLogos {
  logos ??= {
    university: readFileSync(join(LOGO_DIRECTORY, 'usc-logo.png')),
    biosphere: readFileSync(join(LOGO_DIRECTORY, 'biosphere-logo.png')),
  };
  return logos;
}

/** Width/height ratio from a PNG's IHDR chunk. */
export function pngAspectRatio(png: Buffer): number {
  return png.readUInt32BE(16) / png.readUInt32BE(20);
}
