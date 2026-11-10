import { DashboardService } from './dashboard.service';
import type { PrismaService } from '../prisma/prisma.service';

// 2026-09-30T17:00Z is already October 1 in Manila.
const NOW = new Date('2026-09-30T17:00:00.000Z');

function specimenRow(
  id: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    accession_number: `ACC-${id}`,
    scientific_name: 'Papilio polytes',
    common_name: 'Common Mormon',
    specimen_category: 'Insect',
    status: 'UNCATALOGED',
    public_display_allowed: false,
    updated_at: new Date('2026-09-29T00:00:00.000Z'),
    specimen_lot: [],
    ...overrides,
  };
}

function prismaMock() {
  return {
    specimen: {
      groupBy: jest.fn((args: { by: string[] }) => {
        if (args.by.length === 1 && args.by[0] === 'status') {
          return [
            { status: 'UNCATALOGED', _count: { _all: 3 } },
            { status: 'CATALOGED', _count: { _all: 5 } },
          ];
        }
        if (args.by.length === 2) {
          return [
            {
              scientific_name: 'Papilio polytes',
              specimen_category: 'Insect',
              _count: { _all: 1 },
            },
            {
              scientific_name: 'papilio polytes ',
              specimen_category: 'insect',
              _count: { _all: 1 },
            },
            {
              scientific_name: 'Gekko gecko',
              specimen_category: 'Reptile',
              _count: { _all: 1 },
            },
            {
              scientific_name: 'Troides',
              specimen_category: 'Insect',
              _count: { _all: 2 },
            },
          ];
        }
        return [
          { specimen_category: 'Insect', _count: { _all: 4 } },
          { specimen_category: 'insect', _count: { _all: 1 } },
          { specimen_category: null, _count: { _all: 1 } },
          { specimen_category: '  ', _count: { _all: 1 } },
          { specimen_category: 'Reptile', _count: { _all: 1 } },
        ];
      }),
      count: jest.fn((args: { where: { OR?: unknown } }) =>
        args.where.OR ? 1 : 2,
      ),
      findMany: jest.fn((args: { where?: { status?: string } }) =>
        args.where?.status === 'UNCATALOGED'
          ? [specimenRow('q1')]
          : [
              specimenRow('r1', {
                status: 'CATALOGED',
                public_display_allowed: true,
                specimen_lot: [
                  { storage_unit_id: 'drawer', condition_class: 'Good' },
                ],
              }),
              specimenRow('r2', {
                specimen_lot: [
                  { storage_unit_id: 'missing', condition_class: 'Fair' },
                ],
              }),
            ],
      ),
    },
    inquiry: { count: jest.fn(() => 4) },
    visit_request: { count: jest.fn(() => 6) },
    exhibit: {
      groupBy: jest.fn(() => [
        { status: 'PUBLISHED', _count: { _all: 3 } },
        { status: 'UNPUBLISHED', _count: { _all: 2 } },
        { status: 'DISABLED', _count: { _all: 1 } },
      ]),
      count: jest.fn(() => 2),
      findMany: jest.fn(() => [{ id: 'e1', public_slug: 'common-mormon' }]),
    },
    storage_unit: {
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        [
          { id: 'room', parent_id: null, label: 'Room 101', unit_type: 'Room' },
          {
            id: 'cabinet',
            parent_id: 'room',
            label: 'Cabinet A',
            unit_type: 'Cabinet',
          },
          {
            id: 'drawer',
            parent_id: 'cabinet',
            label: 'Drawer 3',
            unit_type: 'Drawer',
          },
        ].filter((unit) => where.id.in.includes(unit.id)),
      ),
    },
  };
}

describe('DashboardService', () => {
  let prisma: ReturnType<typeof prismaMock>;
  let service: DashboardService;

  beforeEach(() => {
    prisma = prismaMock();
    service = new DashboardService(prisma as unknown as PrismaService);
  });

  it('totals specimens by status and counts this museum month', async () => {
    const summary = await service.getSummary(NOW);

    expect(summary.specimens.total).toBe(9);
    expect(summary.specimens.byStatus).toEqual({
      UNCATALOGED: 3,
      CATALOGED: 5,
      ARCHIVED: 1,
    });
    // "This month" is October in Manila: midnight Oct 1 +08:00.
    expect(prisma.specimen.count).toHaveBeenCalledWith({
      where: { created_at: { gte: new Date('2026-09-30T16:00:00.000Z') } },
    });
  });

  it('counts 12 Manila-time months, oldest first', async () => {
    const summary = await service.getSummary(NOW);

    expect(summary.specimens.addedByMonth).toHaveLength(12);
    expect(summary.specimens.addedByMonth[0].month).toBe('2025-11');
    expect(summary.specimens.addedByMonth[11].month).toBe('2026-10');
    type CountArgs = { where: { created_at: { gte: Date; lt?: Date } } };
    const monthCalls = (
      prisma.specimen.count.mock.calls as unknown as [CountArgs][]
    ).filter(([args]) => args.where.created_at?.lt);
    expect(monthCalls).toHaveLength(12);
    expect(monthCalls[11][0]).toEqual({
      where: {
        created_at: {
          gte: new Date('2026-09-30T16:00:00.000Z'),
          lt: new Date('2026-10-31T16:00:00.000Z'),
        },
      },
    });
  });

  it('merges case variants for duplicates and categories', async () => {
    const summary = await service.getSummary(NOW);

    // "Papilio polytes / Insect" twice (case variants) + "Troides" twice.
    expect(summary.specimens.possibleDuplicates).toBe(4);
    expect(summary.specimens.byCategory).toEqual([
      { category: 'Insect', count: 5 },
      { category: 'Uncategorized', count: 2 },
      { category: 'Reptile', count: 1 },
    ]);
  });

  it('reports pending submissions and exhibit readiness', async () => {
    const summary = await service.getSummary(NOW);

    expect(summary.submissions).toEqual({
      pendingInquiries: 4,
      pendingVisitRequests: 6,
    });
    expect(summary.exhibits).toEqual({
      total: 6,
      live: 2,
      publishedUnavailable: 1,
      unpublished: 2,
      disabled: 1,
      pending: [{ id: 'e1', publicSlug: 'common-mormon' }],
    });
    expect(prisma.exhibit.count).toHaveBeenCalledWith({
      where: {
        archived_at: null,
        status: 'PUBLISHED',
        specimen: {
          status: 'CATALOGED',
          archived_at: null,
          public_display_allowed: true,
        },
      },
    });
  });

  it('maps queue and recent rows with the largest lot path and condition', async () => {
    const summary = await service.getSummary(NOW);

    expect(summary.catalogingQueue).toEqual([
      expect.objectContaining({
        id: 'q1',
        storageLocation: null,
        condition: null,
      }),
    ]);
    expect(summary.recentSpecimens).toEqual([
      expect.objectContaining({
        id: 'r1',
        status: 'CATALOGED',
        publicDisplay: true,
        storageLocation: 'Room 101 › Cabinet A › Drawer 3',
        condition: 'Good',
      }),
      expect.objectContaining({
        id: 'r2',
        storageLocation: null,
        condition: 'Fair',
      }),
    ]);
  });
});
