import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveStorageLocations } from '../storage-locations/storage-location-paths';
import type {
  CategoryCount,
  DashboardSpecimenRow,
  DashboardSummary,
  MonthCount,
} from './entities/dashboard-summary.entity';

const MUSEUM_UTC_OFFSET_MS = 8 * 3_600_000;
const TREND_MONTHS = 12;
const CATALOGING_QUEUE_LIMIT = 5;
const RECENT_SPECIMENS_LIMIT = 7;
const PENDING_EXHIBITS_LIMIT = 3;
const UNCATEGORIZED = 'Uncategorized';

const ACTIVE_SPECIMEN = {
  status: { not: 'ARCHIVED' },
  archived_at: null,
} satisfies Prisma.specimenWhereInput;

const SPECIMEN_ROW_SELECT = {
  id: true,
  accession_number: true,
  scientific_name: true,
  common_name: true,
  specimen_category: true,
  status: true,
  public_display_allowed: true,
  updated_at: true,
  // The largest active lot stands for where the specimen mostly lives.
  specimen_lot: {
    where: { is_active: true },
    orderBy: [{ quantity: 'desc' }, { created_at: 'asc' }],
    take: 1,
    select: { storage_unit_id: true, condition_class: true },
  },
} satisfies Prisma.specimenSelect;

type SpecimenRowRecord = Prisma.specimenGetPayload<{
  select: typeof SPECIMEN_ROW_SELECT;
}>;

/** UTC instant of midnight on the first of a month in Philippine time. */
function museumMonthStart(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1) - MUSEUM_UTC_OFFSET_MS);
}

function museumMonth(now: Date) {
  const local = new Date(now.getTime() + MUSEUM_UTC_OFFSET_MS);
  return { year: local.getUTCFullYear(), monthIndex: local.getUTCMonth() };
}

function monthKey(start: Date): string {
  return new Date(start.getTime() + MUSEUM_UTC_OFFSET_MS)
    .toISOString()
    .slice(0, 7);
}

/** Merges values differing only in case or surrounding spaces, keeping the most common spelling. */
function mergeCaseInsensitive(
  rows: { value: string | null; count: number }[],
  blank: string,
): CategoryCount[] {
  const merged = new Map<
    string,
    { total: number; spellings: Map<string, number> }
  >();
  for (const row of rows) {
    const spelling = row.value?.trim() || blank;
    const key = spelling.toLowerCase();
    const entry = merged.get(key) ?? { total: 0, spellings: new Map() };
    entry.total += row.count;
    entry.spellings.set(
      spelling,
      (entry.spellings.get(spelling) ?? 0) + row.count,
    );
    merged.set(key, entry);
  }
  return [...merged.values()]
    .map(({ total, spellings }) => ({
      category: [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0],
      count: total,
    }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(now = new Date()): Promise<DashboardSummary> {
    const { year, monthIndex } = museumMonth(now);
    const monthStarts = Array.from({ length: TREND_MONTHS + 1 }, (_, index) =>
      museumMonthStart(year, monthIndex - (TREND_MONTHS - 1) + index),
    );
    const thisMonthStart = monthStarts[TREND_MONTHS - 1];

    const [
      byStatus,
      addedThisMonth,
      nameCategoryGroups,
      categoryGroups,
      addedPerMonth,
      pendingInquiries,
      pendingVisitRequests,
      exhibitsByStatus,
      liveExhibits,
      pendingExhibits,
      catalogingQueue,
      recentSpecimens,
    ] = await Promise.all([
      this.prisma.specimen.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.specimen.count({
        where: { created_at: { gte: thisMonthStart } },
      }),
      this.prisma.specimen.groupBy({
        by: ['scientific_name', 'specimen_category'],
        where: {
          ...ACTIVE_SPECIMEN,
          scientific_name: { not: null },
          specimen_category: { not: null },
        },
        _count: { _all: true },
      }),
      this.prisma.specimen.groupBy({
        by: ['specimen_category'],
        where: ACTIVE_SPECIMEN,
        _count: { _all: true },
      }),
      Promise.all(
        monthStarts.slice(0, TREND_MONTHS).map((start, index) =>
          this.prisma.specimen.count({
            where: {
              created_at: { gte: start, lt: monthStarts[index + 1] },
            },
          }),
        ),
      ),
      this.prisma.inquiry.count({ where: { status: 'PENDING' } }),
      this.prisma.visit_request.count({ where: { status: 'PENDING' } }),
      this.prisma.exhibit.groupBy({
        by: ['status'],
        where: { archived_at: null },
        _count: { _all: true },
      }),
      this.prisma.exhibit.count({
        where: {
          archived_at: null,
          status: 'PUBLISHED',
          // The public page re-checks these, so only such pages resolve.
          specimen: { status: 'CATALOGED', public_display_allowed: true },
        },
      }),
      this.prisma.exhibit.findMany({
        where: { archived_at: null, status: 'UNPUBLISHED' },
        orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
        take: PENDING_EXHIBITS_LIMIT,
        select: { id: true, public_slug: true },
      }),
      this.prisma.specimen.findMany({
        where: { status: 'UNCATALOGED', archived_at: null },
        orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
        take: CATALOGING_QUEUE_LIMIT,
        select: SPECIMEN_ROW_SELECT,
      }),
      this.prisma.specimen.findMany({
        orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
        take: RECENT_SPECIMENS_LIMIT,
        select: SPECIMEN_ROW_SELECT,
      }),
    ]);

    const statusCounts = { UNCATALOGED: 0, CATALOGED: 0, ARCHIVED: 0 };
    for (const row of byStatus) statusCounts[row.status] = row._count._all;

    const exhibitCounts = { PUBLISHED: 0, UNPUBLISHED: 0, DISABLED: 0 };
    for (const row of exhibitsByStatus) {
      exhibitCounts[row.status] = row._count._all;
    }

    const toRow = await this.specimenRowMapper([
      ...catalogingQueue,
      ...recentSpecimens,
    ]);

    return {
      generatedAt: now,
      specimens: {
        total:
          statusCounts.UNCATALOGED +
          statusCounts.CATALOGED +
          statusCounts.ARCHIVED,
        byStatus: statusCounts,
        addedThisMonth,
        possibleDuplicates: this.countPossibleDuplicates(nameCategoryGroups),
        byCategory: mergeCaseInsensitive(
          categoryGroups.map((row) => ({
            value: row.specimen_category,
            count: row._count._all,
          })),
          UNCATEGORIZED,
        ),
        addedByMonth: addedPerMonth.map((count, index): MonthCount => ({
          month: monthKey(monthStarts[index]),
          count,
        })),
      },
      submissions: { pendingInquiries, pendingVisitRequests },
      exhibits: {
        total:
          exhibitCounts.PUBLISHED +
          exhibitCounts.UNPUBLISHED +
          exhibitCounts.DISABLED,
        live: liveExhibits,
        publishedUnavailable: exhibitCounts.PUBLISHED - liveExhibits,
        unpublished: exhibitCounts.UNPUBLISHED,
        disabled: exhibitCounts.DISABLED,
        pending: pendingExhibits.map((exhibit) => ({
          id: exhibit.id,
          publicSlug: exhibit.public_slug,
        })),
      },
      catalogingQueue: catalogingQueue.map(toRow),
      recentSpecimens: recentSpecimens.map(toRow),
    };
  }

  /** Records whose case-insensitive (name, category) pair is shared by another record. */
  private countPossibleDuplicates(
    groups: {
      scientific_name: string | null;
      specimen_category: string | null;
      _count: { _all: number };
    }[],
  ): number {
    const merged = new Map<string, number>();
    for (const group of groups) {
      const name = group.scientific_name?.trim().toLowerCase();
      const category = group.specimen_category?.trim().toLowerCase();
      if (!name || !category) continue;
      const key = `${name}\u0000${category}`;
      merged.set(key, (merged.get(key) ?? 0) + group._count._all);
    }
    let duplicates = 0;
    for (const count of merged.values()) {
      if (count > 1) duplicates += count;
    }
    return duplicates;
  }

  private async specimenRowMapper(records: SpecimenRowRecord[]) {
    const unitIds = records.flatMap((record) =>
      record.specimen_lot.map((lot) => lot.storage_unit_id),
    );
    const locations = await resolveStorageLocations(this.prisma, unitIds);

    return (record: SpecimenRowRecord): DashboardSpecimenRow => {
      const [lot] = record.specimen_lot;
      return {
        id: record.id,
        accessionNumber: record.accession_number,
        scientificName: record.scientific_name,
        commonName: record.common_name,
        specimenCategory: record.specimen_category,
        status: record.status,
        publicDisplay: record.public_display_allowed,
        storageLocation: lot
          ? (locations.get(lot.storage_unit_id)?.pathLabel ?? null)
          : null,
        condition: lot?.condition_class ?? null,
        updatedAt: record.updated_at,
      };
    };
  }
}
