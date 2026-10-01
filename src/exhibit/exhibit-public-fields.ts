import { BadRequestException } from '@nestjs/common';

// Specimen-derived fields a curator may show on a public QR exhibit page
// (REQ-4.12-03). This is the strict allowlist: exhibit.public_specimen_fields
// may hold only these keys, in this order. Restricted fields (accession
// number, remarks, storage, condition, provenance, curator or audit data) are
// not in it and can never be selected (REQ-4.12-08). The migration default
// for public_specimen_fields lists the same keys.
export const PUBLIC_SPECIMEN_FIELDS = [
  'commonName',
  'scientificName',
  'collection',
  'kingdom',
  'phylum',
  'class',
  'order',
  'family',
  'genus',
  'species',
  'habitat',
  'ecologicalRole',
  'conservationStatus',
] as const;

export type PublicSpecimenField = (typeof PUBLIC_SPECIMEN_FIELDS)[number];

export const TAXONOMY_RANK_FIELDS = [
  'kingdom',
  'phylum',
  'class',
  'order',
  'family',
  'genus',
  'species',
] as const satisfies readonly PublicSpecimenField[];

// Exhibit content that must be filled before an exhibit can be published,
// and that cannot be cleared while it is published.
export const REQUIRED_EXHIBIT_CONTENT = [
  { key: 'publicDescription', column: 'public_description' },
  { key: 'interestingFacts', column: 'interesting_facts' },
  { key: 'distribution', column: 'distribution' },
  { key: 'diet', column: 'diet' },
] as const;

export type RequiredContentColumn =
  (typeof REQUIRED_EXHIBIT_CONTENT)[number]['column'];

export function isPublicSpecimenField(
  value: unknown,
): value is PublicSpecimenField {
  return (PUBLIC_SPECIMEN_FIELDS as readonly unknown[]).includes(value);
}

// Stored in allowlist order so equal selections compare equal and the audit
// diff is stable, whatever order the curator ticked them in.
export function normalizePublicSpecimenFields(
  fields: readonly string[],
): PublicSpecimenField[] {
  const selected = new Set(fields);
  return PUBLIC_SPECIMEN_FIELDS.filter((field) => selected.has(field));
}

// Reads a stored selection defensively. A null column (rows written outside
// the app) falls back to every field, the migration default; unknown keys are
// dropped so a bad value can never widen what the public page shows.
export function storedPublicSpecimenFields(
  stored: readonly string[] | null | undefined,
): PublicSpecimenField[] {
  if (!stored) return [...PUBLIC_SPECIMEN_FIELDS];
  return normalizePublicSpecimenFields(stored.filter(isPublicSpecimenField));
}

// The exhibit content an exhibit is missing for publishing, by API name.
export function missingRequiredContent(
  values: Record<RequiredContentColumn, string | null>,
): string[] {
  return REQUIRED_EXHIBIT_CONTENT.filter(
    ({ column }) => !values[column]?.trim(),
  ).map(({ key }) => key);
}

export function assertRequiredContent(
  values: Record<RequiredContentColumn, string | null>,
  message: string,
): void {
  const missing = missingRequiredContent(values);
  if (missing.length > 0) {
    throw new BadRequestException(`${message} Missing: ${missing.join(', ')}.`);
  }
}
