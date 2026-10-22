import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessionNumberAvailability,
  AccessionNumberHolder,
} from './entities/accession-number.entity';
import { SpecimenStatus } from './entities/specimen.entity';

export const ACCESSION_NUMBER_TAKEN = 'ACCESSION_NUMBER_TAKEN';

/**
 * Proposed museum format for generated numbers: `USC-BM-YYYY-NNNN`, where
 * YYYY is the acceptance year in Asia/Manila and NNNN restarts at 0001 each
 * year. Pending museum confirmation; curator-entered numbers in any other
 * format are still accepted and never rewritten.
 */
export const ACCESSION_PREFIX = 'USC-BM';
const ACCESSION_TIME_ZONE = 'Asia/Manila';
const ACCESSION_SEQUENCE_DIGITS = 4;
// Serializes concurrent allocators; any constant key works.
const ACCESSION_ALLOCATION_LOCK = 4_232_026;

export function accessionYear(at: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: ACCESSION_TIME_ZONE,
      year: 'numeric',
    }).format(at),
  );
}

export function formatAccessionNumber(year: number, sequence: number): string {
  return `${ACCESSION_PREFIX}-${year}-${String(sequence).padStart(ACCESSION_SEQUENCE_DIGITS, '0')}`;
}

interface HolderRow {
  id: string;
  accession_number: string;
  scientific_name: string | null;
  common_name: string | null;
  status: string;
}

type SpecimenReader = Pick<Prisma.TransactionClient, '$queryRaw'>;
type SpecimenAllocator = Pick<
  Prisma.TransactionClient,
  '$queryRaw' | '$executeRaw'
>;

/**
 * Mirrors the `uq_specimen_accession_number` index expression,
 * `lower(btrim(accession_number))`. `btrim` strips only spaces, so this does
 * too. Every lookup below evaluates the expression in PostgreSQL itself so
 * the pre-check can never disagree with the index; this helper is for
 * grouping values in memory (e.g. rows of one import file). Blank means
 * "not assigned".
 */
export function accessionNumberKey(
  value: string | null | undefined,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  const key = value.replace(/^ +| +$/g, '').toLowerCase();
  return key === '' ? undefined : key;
}

// Repeats the index's partial predicate so PostgreSQL can use the index.
const INDEXED_ACCESSION = Prisma.sql`
  s.accession_number IS NOT NULL
  AND btrim(s.accession_number) <> ''`;

/**
 * Accession numbers are unique across every specimen record, Archived ones
 * included, so a number is never reused. No format is enforced yet.
 */
@Injectable()
export class SpecimenAccessionService {
  constructor(private readonly prisma: PrismaService) {}

  async checkAvailability(
    accessionNumber: string,
    excludeSpecimenId?: string,
  ): Promise<AccessionNumberAvailability> {
    const holder = await this.findHolder(
      this.prisma,
      accessionNumber,
      excludeSpecimenId,
    );
    return {
      accessionNumber: accessionNumber.trim(),
      available: holder === null,
      conflictingSpecimen: holder,
    };
  }

  /**
   * Fast, friendly pre-check inside the caller's transaction. The unique
   * index remains the authority for concurrent writers; see
   * {@link isUniqueViolation}.
   */
  async assertAvailable(
    client: SpecimenReader,
    accessionNumber: string | null | undefined,
    excludeSpecimenId?: string,
  ): Promise<void> {
    if (accessionNumberKey(accessionNumber) === undefined) return;
    const holder = await this.findHolder(
      client,
      accessionNumber as string,
      excludeSpecimenId,
    );
    if (holder) {
      throw this.conflict(accessionNumber as string, holder);
    }
  }

  /**
   * Allocates the next generated number for the acceptance year inside the
   * caller's transaction. A transaction-scoped advisory lock serializes
   * allocators, and the sequence is read from every record, Archived
   * included, so a number is never reissued. Gaps left by rolled-back
   * transactions are not refilled.
   */
  async allocateNext(
    client: SpecimenAllocator,
    at: Date = new Date(),
  ): Promise<string> {
    const year = accessionYear(at);
    await client.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(${ACCESSION_ALLOCATION_LOCK})`,
    );
    const pattern = `^${ACCESSION_PREFIX}-${year}-[0-9]+$`;
    const prefixLength = `${ACCESSION_PREFIX}-${year}-`.length;
    const rows = await client.$queryRaw<{ last: number | null }[]>(Prisma.sql`
      SELECT max(substring(btrim(s.accession_number) FROM ${prefixLength + 1})::int) AS last
      FROM specimen s
      WHERE ${INDEXED_ACCESSION}
        AND upper(btrim(s.accession_number)) ~ ${pattern}`);
    const last = rows[0]?.last ?? 0;
    return formatAccessionNumber(year, Number(last) + 1);
  }

  /**
   * Looks up every record already holding one of the given numbers. The map
   * is keyed by each input value exactly as passed, so callers need not
   * re-derive the database's comparison key.
   */
  async findHolders(
    accessionNumbers: (string | null | undefined)[],
  ): Promise<Map<string, AccessionNumberHolder>> {
    const values = [
      ...new Set(
        accessionNumbers.filter(
          (value): value is string => accessionNumberKey(value) !== undefined,
        ),
      ),
    ];
    const holders = new Map<string, AccessionNumberHolder>();
    if (values.length === 0) return holders;

    const rows = await this.prisma.$queryRaw<
      (HolderRow & { input_value: string })[]
    >(Prisma.sql`
      SELECT DISTINCT ON (input.value)
        input.value AS input_value,
        s.id, s.accession_number, s.scientific_name, s.common_name,
        s.status::text AS status
      FROM unnest(${values}::text[]) AS input(value)
      JOIN specimen s
        ON lower(btrim(s.accession_number)) = lower(btrim(input.value))
      WHERE ${INDEXED_ACCESSION}
      ORDER BY input.value, s.created_at, s.id`);
    for (const row of rows) {
      holders.set(row.input_value, this.toHolder(row));
    }
    return holders;
  }

  /**
   * A specimen's only other unique column is its generated primary key, so a
   * unique violation raised by a specimen create/update is the accession
   * index losing a race the pre-check could not see.
   */
  isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }

  conflict(
    accessionNumber: string,
    holder: AccessionNumberHolder | null = null,
  ): ConflictException {
    const value = accessionNumber.trim();
    const archivedNote =
      holder?.status === SpecimenStatus.ARCHIVED
        ? ' (an Archived record; archived numbers are not reused)'
        : '';
    return new ConflictException({
      statusCode: 409,
      error: 'Conflict',
      code: ACCESSION_NUMBER_TAKEN,
      message: `Accession number "${value}" is already assigned to another specimen record${archivedNote}.`,
      accessionNumber: value,
      conflictingSpecimen: holder,
    });
  }

  private async findHolder(
    client: SpecimenReader,
    accessionNumber: string,
    excludeSpecimenId?: string,
  ): Promise<AccessionNumberHolder | null> {
    // Both sides go through lower(btrim(...)) so a legacy stored value such
    // as " ABC-100 " is found exactly as the unique index would treat it.
    const excludeClause = excludeSpecimenId
      ? Prisma.sql`AND s.id <> ${excludeSpecimenId}::uuid`
      : Prisma.empty;
    const rows = await client.$queryRaw<HolderRow[]>(Prisma.sql`
      SELECT s.id, s.accession_number, s.scientific_name, s.common_name,
        s.status::text AS status
      FROM specimen s
      WHERE ${INDEXED_ACCESSION}
        AND lower(btrim(s.accession_number)) = lower(btrim(${accessionNumber}))
        ${excludeClause}
      ORDER BY s.created_at, s.id
      LIMIT 1`);
    return rows.length > 0 ? this.toHolder(rows[0]) : null;
  }

  private toHolder(record: HolderRow): AccessionNumberHolder {
    return {
      id: record.id,
      accessionNumber: record.accession_number,
      scientificName: record.scientific_name,
      commonName: record.common_name,
      status: record.status as SpecimenStatus,
    };
  }
}
