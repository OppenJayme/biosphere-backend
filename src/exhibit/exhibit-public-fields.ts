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

// Specimen fields that identify the exhibit to a visitor.
export const IDENTIFYING_FIELDS = [
  'commonName',
  'scientificName',
] as const satisfies readonly PublicSpecimenField[];

// The exhibit's own written content. Every item is optional on its own:
// a specimen may have no known diet or distribution (e.g. a plant).
export const EXHIBIT_CONTENT_FIELDS = [
  { key: 'publicDescription', column: 'public_description' },
  { key: 'interestingFacts', column: 'interesting_facts' },
  { key: 'distribution', column: 'distribution' },
  { key: 'diet', column: 'diet' },
] as const;

export type ExhibitContentColumn =
  (typeof EXHIBIT_CONTENT_FIELDS)[number]['column'];

// Why an exhibit cannot be published yet; returned as missingForPublish.
export enum PublishRequirement {
  // No common or scientific name is both selected and filled in.
  IDENTIFYING_NAME = 'identifyingName',
  // No other selected specimen field and no exhibit content has a value.
  PUBLIC_INFORMATION = 'publicInformation',
}

const REQUIREMENT_MESSAGES: Record<PublishRequirement, string> = {
  [PublishRequirement.IDENTIFYING_NAME]:
    'show a common or scientific name that has a value',
  [PublishRequirement.PUBLIC_INFORMATION]:
    'add at least one piece of public information (a description, interesting facts, distribution, diet, or a selected specimen field with a value)',
};

export type SpecimenFieldValues = Record<PublicSpecimenField, string | null>;

// The specimen columns behind the allowlisted fields.
export interface SpecimenFieldSource {
  common_name: string | null;
  scientific_name: string | null;
  collection: { collection_name: string } | null;
  specimen_taxonomy: {
    kingdom: string | null;
    phylum: string | null;
    class: string | null;
    order_name: string | null;
    family: string | null;
    genus: string | null;
    species: string | null;
    habitat: string | null;
    ecological_role: string | null;
    conservation_status: string | null;
  } | null;
}

export function specimenFieldValues(
  specimen: SpecimenFieldSource,
): SpecimenFieldValues {
  const taxonomy = specimen.specimen_taxonomy;
  return {
    commonName: specimen.common_name,
    scientificName: specimen.scientific_name,
    collection: specimen.collection?.collection_name ?? null,
    kingdom: taxonomy?.kingdom ?? null,
    phylum: taxonomy?.phylum ?? null,
    class: taxonomy?.class ?? null,
    order: taxonomy?.order_name ?? null,
    family: taxonomy?.family ?? null,
    genus: taxonomy?.genus ?? null,
    species: taxonomy?.species ?? null,
    habitat: taxonomy?.habitat ?? null,
    ecologicalRole: taxonomy?.ecological_role ?? null,
    conservationStatus: taxonomy?.conservation_status ?? null,
  };
}

export function hasPublicValue(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export interface PublishReadiness {
  missing: PublishRequirement[];
  // Selected fields the specimen has no value for. They are left off the
  // public page; the curator is warned instead of being blocked.
  emptySelectedFields: PublicSpecimenField[];
}

// Minimum publish-readiness rule: an identifying name a visitor can see,
// plus at least one meaningful piece of public information. Images, AR, and
// any single content item stay optional.
export function publishReadiness(input: {
  selected: readonly PublicSpecimenField[];
  values: SpecimenFieldValues;
  content: Record<ExhibitContentColumn, string | null>;
}): PublishReadiness {
  const filled = input.selected.filter((field) =>
    hasPublicValue(input.values[field]),
  );
  const isIdentifying = (field: PublicSpecimenField) =>
    (IDENTIFYING_FIELDS as readonly string[]).includes(field);

  const missing: PublishRequirement[] = [];
  if (!filled.some(isIdentifying)) {
    missing.push(PublishRequirement.IDENTIFYING_NAME);
  }
  const hasInformation =
    filled.some((field) => !isIdentifying(field)) ||
    EXHIBIT_CONTENT_FIELDS.some(({ column }) =>
      hasPublicValue(input.content[column]),
    );
  if (!hasInformation) missing.push(PublishRequirement.PUBLIC_INFORMATION);

  return {
    missing,
    emptySelectedFields: input.selected.filter(
      (field) => !hasPublicValue(input.values[field]),
    ),
  };
}

export function assertPublishReady(
  readiness: PublishReadiness,
  message: string,
): void {
  if (readiness.missing.length === 0) return;
  const steps = readiness.missing.map(
    (requirement) => REQUIREMENT_MESSAGES[requirement],
  );
  throw new BadRequestException(
    `${message} To publish, ${steps.join(' and ')}. Missing: ${readiness.missing.join(', ')}.`,
  );
}
