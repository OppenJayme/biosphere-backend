import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DuplicateConfidence,
  DuplicateMatchField,
  PossibleDuplicate,
  SpecimenDuplicateCheckResult,
} from './entities/specimen-duplicate.entity';
import { SpecimenStatus } from './entities/specimen.entity';

/** Upper bound on warnings returned for one checked record. */
export const MAX_POSSIBLE_DUPLICATES = 20;

/**
 * The values a duplicate check compares. Any field may be missing; a field
 * only counts as matching or differing when both records have it.
 */
export interface DuplicateCandidate {
  accessionNumber?: string | null;
  scientificName?: string | null;
  commonName?: string | null;
  collector?: string | null;
  donor?: string | null;
  collectionLocation?: string | null;
  /** YYYY-MM-DD */
  collectionDate?: string | null;
}

export interface DuplicateEvaluation {
  confidence: DuplicateConfidence;
  matchedFields: DuplicateMatchField[];
  differingFields: DuplicateMatchField[];
}

type NormalizedCandidate = Record<keyof DuplicateCandidate, string | undefined>;

type FieldRule = [keyof DuplicateCandidate, DuplicateMatchField];

/**
 * Distinctions BR-09 names explicitly and that the schema can compare:
 * when both records have a value and they differ, the records are allowed
 * to coexist and no name-based warning is raised. Physical grouping,
 * storage assignment, and other curator-approved distinctions are not
 * compared yet; adding one here needs curator approval first.
 */
const DISTINGUISHING_FIELDS: FieldRule[] = [
  ['collector', DuplicateMatchField.COLLECTOR],
  ['donor', DuplicateMatchField.DONOR],
];

/**
 * Supporting provenance: a match raises a same-species warning to HIGH, a
 * difference is only reported for context. Never suppresses a warning.
 */
const SUPPORTING_FIELDS: FieldRule[] = [
  ['collectionLocation', DuplicateMatchField.COLLECTION_LOCATION],
  ['collectionDate', DuplicateMatchField.COLLECTION_DATE],
];

const EXISTING_SPECIMEN_SELECT = {
  id: true,
  accession_number: true,
  scientific_name: true,
  common_name: true,
  status: true,
  specimen_provenance: {
    select: {
      collector: true,
      donor: true,
      collection_location: true,
      collection_date: true,
    },
  },
} satisfies Prisma.specimenSelect;

type ExistingSpecimen = Prisma.specimenGetPayload<{
  select: typeof EXISTING_SPECIMEN_SELECT;
}>;

const FIELD_LABELS: Record<DuplicateMatchField, string> = {
  [DuplicateMatchField.ACCESSION_NUMBER]: 'accession number',
  [DuplicateMatchField.SCIENTIFIC_NAME]: 'scientific name',
  [DuplicateMatchField.COMMON_NAME]: 'common name',
  [DuplicateMatchField.COLLECTOR]: 'collector',
  [DuplicateMatchField.DONOR]: 'donor',
  [DuplicateMatchField.COLLECTION_LOCATION]: 'collection location',
  [DuplicateMatchField.COLLECTION_DATE]: 'collection date',
};

/**
 * Trim + case-fold only, mirroring the database lookup (trimmed value,
 * case-insensitive equality). Collapsing inner whitespace here would be
 * misleading, since the lookup could never fetch such a variant.
 */
function normalize(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized === '' ? undefined : normalized;
}

function normalizeCandidate(
  candidate: DuplicateCandidate,
): NormalizedCandidate {
  return {
    accessionNumber: normalize(candidate.accessionNumber),
    scientificName: normalize(candidate.scientificName),
    commonName: normalize(candidate.commonName),
    collector: normalize(candidate.collector),
    donor: normalize(candidate.donor),
    collectionLocation: normalize(candidate.collectionLocation),
    collectionDate: normalize(candidate.collectionDate),
  };
}

function bothPresent(a: string | undefined, b: string | undefined): boolean {
  return a !== undefined && b !== undefined;
}

/**
 * Warning-only duplicate heuristic (REQ-4.4-21/22/23, BR-09):
 *
 * - A shared accession number is always reported (HIGH), whatever else
 *   differs, because accession numbers are meant to identify one record.
 * - Otherwise the records must name the same species: equal scientific
 *   names, or equal common names when either side has no scientific name.
 * - Same species alone is not a duplicate. If the collector or donor is
 *   filled on both records and differs, they are separate records per
 *   BR-09 and nothing is reported.
 * - Otherwise a matching collector, donor, collection location, or
 *   collection date makes it HIGH; with none of those matching, it is
 *   MEDIUM only when both scientific and common names match (the rule bulk
 *   import has always used).
 */
export function evaluateDuplicate(
  candidate: DuplicateCandidate,
  existing: DuplicateCandidate,
): DuplicateEvaluation | null {
  return evaluateNormalized(
    normalizeCandidate(candidate),
    normalizeCandidate(existing),
  );
}

function evaluateNormalized(
  a: NormalizedCandidate,
  b: NormalizedCandidate,
): DuplicateEvaluation | null {
  const matched: DuplicateMatchField[] = [];
  const differing: DuplicateMatchField[] = [];

  const compare = (
    field: keyof DuplicateCandidate,
    label: DuplicateMatchField,
  ): void => {
    if (!bothPresent(a[field], b[field])) return;
    (a[field] === b[field] ? matched : differing).push(label);
  };

  const accessionMatch =
    bothPresent(a.accessionNumber, b.accessionNumber) &&
    a.accessionNumber === b.accessionNumber;
  if (accessionMatch) matched.push(DuplicateMatchField.ACCESSION_NUMBER);

  const scientificMatch =
    bothPresent(a.scientificName, b.scientificName) &&
    a.scientificName === b.scientificName;
  const commonMatch =
    bothPresent(a.commonName, b.commonName) && a.commonName === b.commonName;
  if (scientificMatch) matched.push(DuplicateMatchField.SCIENTIFIC_NAME);
  if (commonMatch) matched.push(DuplicateMatchField.COMMON_NAME);

  const distinguishing: DuplicateMatchField[] = [];
  let provenanceMatched = false;
  for (const [field, label] of [
    ...DISTINGUISHING_FIELDS,
    ...SUPPORTING_FIELDS,
  ]) {
    const before = matched.length;
    compare(field, label);
    if (matched.length > before) provenanceMatched = true;
  }
  for (const [, label] of DISTINGUISHING_FIELDS) {
    if (differing.includes(label)) distinguishing.push(label);
  }

  if (accessionMatch) {
    return {
      confidence: DuplicateConfidence.HIGH,
      matchedFields: matched,
      differingFields: differing,
    };
  }

  const sameSpecies =
    scientificMatch ||
    (commonMatch && (!a.scientificName || !b.scientificName));
  if (!sameSpecies || distinguishing.length > 0) return null;

  if (provenanceMatched) {
    return {
      confidence: DuplicateConfidence.HIGH,
      matchedFields: matched,
      differingFields: differing,
    };
  }
  if (scientificMatch && commonMatch) {
    return {
      confidence: DuplicateConfidence.MEDIUM,
      matchedFields: matched,
      differingFields: differing,
    };
  }
  return null;
}

export function describeDuplicate(evaluation: DuplicateEvaluation): string {
  const matched = evaluation.matchedFields
    .map((field) => FIELD_LABELS[field])
    .join(', ');
  let message = `Possible duplicate: same ${matched}.`;
  if (evaluation.differingFields.length > 0) {
    message += ` Differs in ${evaluation.differingFields
      .map((field) => FIELD_LABELS[field])
      .join(', ')}.`;
  }
  return `${message} Confirm this is not the same specimen before continuing.`;
}

@Injectable()
export class SpecimenDuplicatesService {
  private readonly logger = new Logger(SpecimenDuplicatesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * For a record that has already been committed. The warning is
   * non-critical, so a failed lookup must not turn a successful create into
   * an error response: that would leave the client unsure whether the write
   * happened and invite a retry that creates a second record. A failure is
   * logged and reported as `duplicateCheckAvailable: false` instead.
   */
  async findAfterCreate(
    candidate: DuplicateCandidate,
    createdSpecimenId: string,
  ): Promise<SpecimenDuplicateCheckResult> {
    try {
      return {
        possibleDuplicates: await this.findForCandidate(candidate, [
          createdSpecimenId,
        ]),
        duplicateCheckAvailable: true,
      };
    } catch (error) {
      this.logger.error(
        `Duplicate check failed after creating specimen ${createdSpecimenId}.`,
        error instanceof Error ? error.stack : error,
      );
      return { possibleDuplicates: [], duplicateCheckAvailable: false };
    }
  }

  async findForCandidate(
    candidate: DuplicateCandidate,
    excludeSpecimenIds: string[] = [],
  ): Promise<PossibleDuplicate[]> {
    const [matches] = await this.findForCandidates(
      [candidate],
      excludeSpecimenIds,
    );
    return matches;
  }

  /**
   * Checks many candidates against active (non-archived) specimens with a
   * single query, returning one list per candidate in the same order. Used by
   * bulk import so a 500-row preview stays one round trip.
   */
  async findForCandidates(
    candidates: DuplicateCandidate[],
    excludeSpecimenIds: string[] = [],
  ): Promise<PossibleDuplicate[][]> {
    const normalizedCandidates = candidates.map(normalizeCandidate);
    const where = this.buildLookupWhere(candidates, excludeSpecimenIds);
    if (!where) return candidates.map(() => []);

    const existing = (
      await this.prisma.specimen.findMany({
        where,
        select: EXISTING_SPECIMEN_SELECT,
      })
    ).filter((record) => !excludeSpecimenIds.includes(record.id));
    const normalizedExisting = existing.map((record) => ({
      record,
      normalized: normalizeCandidate(this.toCandidate(record)),
    }));

    return normalizedCandidates.map((candidate) =>
      normalizedExisting
        .flatMap(({ record, normalized }) => {
          const evaluation = evaluateNormalized(candidate, normalized);
          return evaluation
            ? [this.toPossibleDuplicate(record, evaluation)]
            : [];
        })
        .sort(comparePossibleDuplicates)
        .slice(0, MAX_POSSIBLE_DUPLICATES),
    );
  }

  /**
   * Compares candidates against each other (e.g. rows of one import file).
   * Result `i` lists every other candidate index that `i` may duplicate.
   */
  compareWithinBatch(
    candidates: DuplicateCandidate[],
  ): { index: number; evaluation: DuplicateEvaluation }[][] {
    const normalized = candidates.map(normalizeCandidate);
    const results = candidates.map(
      () => [] as { index: number; evaluation: DuplicateEvaluation }[],
    );
    for (let i = 0; i < normalized.length; i++) {
      for (let j = i + 1; j < normalized.length; j++) {
        const evaluation = evaluateNormalized(normalized[i], normalized[j]);
        if (!evaluation) continue;
        results[i].push({ index: j, evaluation });
        results[j].push({ index: i, evaluation });
      }
    }
    return results;
  }

  /**
   * Re-checks a saved specimen, including its provenance, against every
   * other active specimen. Useful after provenance is filled in, since the
   * core create endpoint can only compare core fields.
   */
  async findForSpecimen(specimenId: string): Promise<PossibleDuplicate[]> {
    const specimen = await this.prisma.specimen.findUnique({
      where: { id: specimenId },
      select: EXISTING_SPECIMEN_SELECT,
    });
    if (!specimen) {
      throw new NotFoundException(`Specimen ${specimenId} not found`);
    }
    return this.findForCandidate(this.toCandidate(specimen), [specimenId]);
  }

  private buildLookupWhere(
    candidates: DuplicateCandidate[],
    excludeSpecimenIds: string[],
  ): Prisma.specimenWhereInput | null {
    const unique = (values: (string | null | undefined)[]): string[] => [
      ...new Set(
        values
          .map((value) => value?.trim())
          .filter((value): value is string => !!value),
      ),
    ];
    const insensitive = (value: string) => ({
      equals: value,
      mode: Prisma.QueryMode.insensitive,
    });

    // Name lookups are a superset; the in-memory evaluation decides what
    // actually counts as a possible duplicate.
    const or: Prisma.specimenWhereInput[] = [
      ...unique(candidates.map((c) => c.accessionNumber)).map((value) => ({
        accession_number: insensitive(value),
      })),
      ...unique(candidates.map((c) => c.scientificName)).map((value) => ({
        scientific_name: insensitive(value),
      })),
      ...unique(candidates.map((c) => c.commonName)).map((value) => ({
        common_name: insensitive(value),
      })),
    ];
    if (or.length === 0) return null;

    return {
      status: { not: 'ARCHIVED' },
      ...(excludeSpecimenIds.length > 0
        ? { id: { notIn: excludeSpecimenIds } }
        : {}),
      OR: or,
    };
  }

  private toCandidate(record: ExistingSpecimen): DuplicateCandidate {
    const provenance = record.specimen_provenance;
    return {
      accessionNumber: record.accession_number,
      scientificName: record.scientific_name,
      commonName: record.common_name,
      collector: provenance?.collector,
      donor: provenance?.donor,
      collectionLocation: provenance?.collection_location,
      collectionDate: provenance?.collection_date
        ? provenance.collection_date.toISOString().slice(0, 10)
        : null,
    };
  }

  private toPossibleDuplicate(
    record: ExistingSpecimen,
    evaluation: DuplicateEvaluation,
  ): PossibleDuplicate {
    return {
      specimenId: record.id,
      accessionNumber: record.accession_number,
      scientificName: record.scientific_name,
      commonName: record.common_name,
      status: record.status as SpecimenStatus,
      confidence: evaluation.confidence,
      matchedFields: evaluation.matchedFields,
      differingFields: evaluation.differingFields,
      message: describeDuplicate(evaluation),
    };
  }
}

function comparePossibleDuplicates(
  a: PossibleDuplicate,
  b: PossibleDuplicate,
): number {
  if (a.confidence !== b.confidence) {
    return a.confidence === DuplicateConfidence.HIGH ? -1 : 1;
  }
  if (a.matchedFields.length !== b.matchedFields.length) {
    return b.matchedFields.length - a.matchedFields.length;
  }
  return a.specimenId.localeCompare(b.specimenId);
}
