import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessionNumberAvailability,
  AccessionNumberHolder,
} from './entities/accession-number.entity';
import { SpecimenStatus } from './entities/specimen.entity';

export const ACCESSION_NUMBER_TAKEN = 'ACCESSION_NUMBER_TAKEN';

const HOLDER_SELECT = {
  id: true,
  accession_number: true,
  scientific_name: true,
  common_name: true,
  status: true,
} satisfies Prisma.specimenSelect;

type HolderRecord = Prisma.specimenGetPayload<{
  select: typeof HOLDER_SELECT;
}>;

type SpecimenReader = Pick<Prisma.TransactionClient, 'specimen'>;

/**
 * The comparison key for the curator-approved uniqueness rule (REQ-4.4-04,
 * BR-01): trimmed and case-folded, matching the
 * `lower(btrim(accession_number))` expression behind the
 * `uq_specimen_accession_number` index. Blank means "not assigned".
 */
export function accessionNumberKey(
  value: string | null | undefined,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  const key = value.trim().toLowerCase();
  return key === '' ? undefined : key;
}

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
   * Looks up every record already holding one of the given numbers, keyed by
   * {@link accessionNumberKey}. Used by bulk import to validate a whole file.
   */
  async findHolders(
    accessionNumbers: (string | null | undefined)[],
  ): Promise<Map<string, AccessionNumberHolder>> {
    const values = [
      ...new Map(
        accessionNumbers
          .filter((value) => accessionNumberKey(value) !== undefined)
          .map((value) => [
            accessionNumberKey(value),
            (value as string).trim(),
          ]),
      ).values(),
    ];
    const holders = new Map<string, AccessionNumberHolder>();
    if (values.length === 0) return holders;

    const records = await this.prisma.specimen.findMany({
      where: {
        OR: values.map((value) => ({
          accession_number: {
            equals: value,
            mode: Prisma.QueryMode.insensitive,
          },
        })),
      },
      select: HOLDER_SELECT,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    for (const record of records) {
      const key = accessionNumberKey(record.accession_number);
      if (key !== undefined && !holders.has(key)) {
        holders.set(key, this.toHolder(record));
      }
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
    // Values written by the API are trimmed, so an insensitive equality on
    // the trimmed input finds them; a legacy untrimmed value is still caught
    // by the unique index at write time.
    const record = await client.specimen.findFirst({
      where: {
        accession_number: {
          equals: accessionNumber.trim(),
          mode: Prisma.QueryMode.insensitive,
        },
        id: excludeSpecimenId ? { not: excludeSpecimenId } : undefined,
      },
      select: HOLDER_SELECT,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
    return record ? this.toHolder(record) : null;
  }

  private toHolder(record: HolderRecord): AccessionNumberHolder {
    return {
      id: record.id,
      accessionNumber: record.accession_number as string,
      scientificName: record.scientific_name,
      commonName: record.common_name,
      status: record.status as SpecimenStatus,
    };
  }
}
