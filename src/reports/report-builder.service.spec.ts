import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import type { GenerateReportDto } from './dto/generate-report.dto';
import {
  MAX_REPORT_DETAIL_ROWS,
  ReportBuilderService,
  type ReportContext,
} from './report-builder.service';
import type { ReportBlock, ReportDocument } from './report-document';
import { ReportPeriodType, resolveReportPeriod } from './report-period';
import { ReportFormat, ReportType } from './report-types';

const prismaMock = {
  storage_unit: { findMany: jest.fn(), findUnique: jest.fn() },
  specimen: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  specimen_lot: { groupBy: jest.fn(), aggregate: jest.fn() },
  specimen_revision_history: { count: jest.fn() },
  specimen_lot_transaction: { groupBy: jest.fn() },
  inquiry: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  visit_request: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  exhibit: { count: jest.fn(), findMany: jest.fn(), groupBy: jest.fn() },
  audit_log: { count: jest.fn(), findMany: jest.fn() },
};

const UNITS = [
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
  { id: 'other', parent_id: null, label: 'Room 102', unit_type: 'Room' },
];

// Answers the `id in` and `parent_id in` lookups the shared storage path
// and subtree helpers make.
function findUnits(args: {
  where: { id?: { in: string[] }; parent_id?: { in: string[] } };
}) {
  const { id, parent_id } = args.where;
  return Promise.resolve(
    UNITS.filter((unit) =>
      id
        ? id.in.includes(unit.id)
        : parent_id!.in.includes(unit.parent_id as string),
    ),
  );
}

function context(overrides: Partial<GenerateReportDto>): ReportContext {
  const dto = {
    format: ReportFormat.PDF,
    period: ReportPeriodType.ALL_TIME,
    ...overrides,
  } as GenerateReportDto;
  return {
    dto,
    period: resolveReportPeriod(dto),
    generatedAt: new Date('2026-09-30T00:00:00.000Z'),
    generatedBy: 'Test Curator',
  };
}

function tableRows(document: ReportDocument, title: string) {
  const block = document.blocks.find(
    (item): item is Extract<ReportBlock, { kind: 'table' }> =>
      item.kind === 'table' && item.table.title === title,
  );
  return block?.table.rows;
}

/** The untitled detail table printed in PDF/DOCX (CSV uses csvTable). */
function printedDetail(document: ReportDocument) {
  const block = document.blocks.find(
    (item): item is Extract<ReportBlock, { kind: 'table' }> =>
      item.kind === 'table' && item.table.title === undefined,
  );
  return block?.table;
}

function keyValue(document: ReportDocument, label: string) {
  for (const block of document.blocks) {
    if (block.kind !== 'keyValues') continue;
    const item = block.items.find((entry) => entry.label === label);
    if (item) return item.value;
  }
  return undefined;
}

describe('ReportBuilderService', () => {
  let service: ReportBuilderService;

  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.storage_unit.findMany.mockImplementation(findUnits);
    prismaMock.storage_unit.findUnique.mockImplementation(
      (args: { where: { id: string } }) =>
        Promise.resolve(
          UNITS.find((unit) => unit.id === args.where.id) ?? null,
        ),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportBuilderService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(ReportBuilderService);
  });

  describe('inventory report', () => {
    beforeEach(() => {
      prismaMock.specimen.count.mockResolvedValue(1);
      prismaMock.specimen.findMany.mockResolvedValue([
        {
          accession_number: 'ENT-1',
          scientific_name: 'Papilio polytes',
          common_name: 'Common Mormon',
          specimen_category: 'Entomology',
          status: 'CATALOGED',
          classification_status: 'Identified',
          public_display_allowed: true,
          created_at: new Date('2026-09-15T02:00:00.000Z'),
          collection: { collection_name: 'Schoenig' },
          specimen_taxonomy: { family: 'Papilionidae' },
          specimen_lot: [
            { quantity: 3, condition_class: 'Good', storage_unit_id: 'drawer' },
            {
              quantity: 2,
              condition_class: 'good',
              storage_unit_id: 'cabinet',
            },
          ],
        },
      ]);
    });

    it('filters by taxonomy, period, and a storage unit with its descendants', async () => {
      await service.build(
        context({
          type: ReportType.INVENTORY,
          period: ReportPeriodType.MONTHLY,
          month: '2026-09',
          family: 'papilionidae',
          conditionClass: 'Good',
          storageUnitId: 'room',
        }),
      );

      const { where } = prismaMock.specimen.findMany.mock.calls[0][0];
      expect(where.created_at).toEqual({
        gte: new Date('2026-08-31T16:00:00.000Z'),
        lt: new Date('2026-09-30T16:00:00.000Z'),
      });
      expect(where.specimen_taxonomy).toEqual({
        is: expect.objectContaining({
          family: { equals: 'papilionidae', mode: 'insensitive' },
          genus: undefined,
        }),
      });
      expect(where.specimen_lot.some).toEqual({
        is_active: true,
        condition_class: { equals: 'Good', mode: 'insensitive' },
        storage_unit_id: { in: ['room', 'cabinet', 'drawer'] },
      });
    });

    it('matches only the unit itself when descendants are excluded', async () => {
      await service.build(
        context({
          type: ReportType.INVENTORY,
          storageUnitId: 'cabinet',
          includeDescendantUnits: false,
        }),
      );

      const { where } = prismaMock.specimen.findMany.mock.calls[0][0];
      expect(where.specimen_lot.some.storage_unit_id).toEqual({
        in: ['cabinet'],
      });
      expect(where.specimen_taxonomy).toBeUndefined();
    });

    it('rejects an unknown storage unit', async () => {
      await expect(
        service.build(
          context({ type: ReportType.INVENTORY, storageUnitId: 'missing' }),
        ),
      ).rejects.toThrow('The selected storage location does not exist.');
    });

    it('builds rows with storage paths and merged condition classes', async () => {
      const document = await service.build(
        context({ type: ReportType.INVENTORY }),
      );

      expect(document.confidential).toBe(true);
      expect(document.rowCount).toBe(1);
      expect(document.csvTable?.rows[0]).toEqual([
        'ENT-1',
        'Papilio polytes',
        'Common Mormon',
        'Entomology',
        'Schoenig',
        'Papilionidae',
        'Cataloged',
        'Identified',
        'Yes',
        5,
        'Good',
        'Room 101 › Cabinet A › Drawer 3; Room 101 › Cabinet A',
        'Sep 15, 2026',
      ]);
      expect(tableRows(document, 'Active lots by condition')).toEqual([
        ['Good', 2, 5],
      ]);
      expect(keyValue(document, 'Total specimens in active lots')).toBe(5);
    });

    it('prints a portrait-width table and keeps every column in the CSV', async () => {
      const document = await service.build(
        context({ type: ReportType.INVENTORY }),
      );

      expect(document.csvTable?.columns).toHaveLength(13);
      expect(printedDetail(document)).toEqual({
        columns: [
          'Accession No.',
          'Specimen',
          'Status',
          'Qty',
          'Condition',
          'Storage Location',
        ],
        rows: [
          [
            'ENT-1',
            'Papilio polytes\nCommon Mormon',
            'Cataloged',
            5,
            'Good',
            'Room 101 › Cabinet A › Drawer 3\nRoom 101 › Cabinet A',
          ],
        ],
      });
      // The period is in the report header, so the scope box doesn't repeat it.
      expect(keyValue(document, 'Period')).toBeUndefined();
      expect(keyValue(document, 'Period applies to')).toBeDefined();
    });

    it('refuses to build a report past the row limit instead of truncating it', async () => {
      prismaMock.specimen.count.mockResolvedValue(MAX_REPORT_DETAIL_ROWS + 1);

      const attempt = service.build(context({ type: ReportType.INVENTORY }));

      await expect(attempt).rejects.toBeInstanceOf(BadRequestException);
      await expect(attempt).rejects.toThrow(/Narrow the period or filters/);
      expect(prismaMock.specimen.findMany).not.toHaveBeenCalled();
    });
  });

  it('formats approved visit schedules and totals visitors by status', async () => {
    prismaMock.visit_request.count.mockResolvedValue(2);
    prismaMock.visit_request.findMany.mockResolvedValue([
      {
        created_at: new Date('2026-09-05T00:00:00.000Z'),
        contact_person: 'Maria',
        organization_name: 'USC',
        email_address: 'maria@example.com',
        contact_number: '0918',
        visitor_count: 30,
        status: 'COMPLETED',
        approved_date: new Date('2026-09-20T00:00:00.000Z'),
        approved_start_time: new Date('1970-01-01T09:00:00.000Z'),
        approved_end_time: new Date('1970-01-01T11:30:00.000Z'),
        user_account: { full_name: 'Test Curator' },
      },
      {
        created_at: new Date('2026-09-06T00:00:00.000Z'),
        contact_person: 'Jose',
        organization_name: 'DepEd',
        email_address: 'jose@example.com',
        contact_number: '0917',
        visitor_count: 12,
        status: 'PENDING',
        approved_date: null,
        approved_start_time: null,
        approved_end_time: null,
        user_account: null,
      },
    ]);

    const document = await service.build(
      context({ type: ReportType.VISIT_REQUEST_SUMMARY }),
    );

    expect(document.csvTable?.rows[0][7]).toBe('Sep 20, 2026 09:00-11:30');
    expect(document.csvTable?.rows[1][7]).toBeNull();
    expect(keyValue(document, 'Visitors requested')).toBe(42);
    expect(keyValue(document, 'Visitors in completed visits')).toBe(30);
    expect(tableRows(document, 'By status')).toContainEqual(['Pending', 1, 12]);
    expect(printedDetail(document)?.rows).toEqual([
      [
        'Sep 5, 2026',
        'Maria\nUSC',
        'maria@example.com\n0918',
        30,
        'Completed\nSep 20, 2026 09:00-11:30',
      ],
      ['Sep 6, 2026', 'Jose\nDepEd', 'jose@example.com\n0917', 12, 'Pending'],
    ]);
  });

  it('stacks inquiry contact details into a five-column printed table', async () => {
    prismaMock.inquiry.count.mockResolvedValue(1);
    prismaMock.inquiry.findMany.mockResolvedValue([
      {
        created_at: new Date('2026-09-05T00:00:00.000Z'),
        full_name: 'Ana Cruz',
        organization_name: null,
        email_address: 'ana@example.com',
        contact_number: '0917',
        inquiry_type: 'Research',
        status: 'PENDING',
        user_account: { full_name: 'Test Curator' },
      },
    ]);

    const document = await service.build(
      context({ type: ReportType.INQUIRY_SUMMARY }),
    );

    expect(document.csvTable?.columns).toHaveLength(8);
    expect(printedDetail(document)?.rows).toEqual([
      [
        'Sep 5, 2026',
        'Ana Cruz',
        'ana@example.com\n0917',
        'Research',
        'Pending',
      ],
    ]);
  });

  it('prints exhibits with AR status and asset count in one column', async () => {
    prismaMock.exhibit.count.mockResolvedValue(1);
    prismaMock.exhibit.findMany.mockResolvedValue([
      {
        public_slug: 'common-mormon',
        status: 'PUBLISHED',
        published_at: new Date('2026-09-10T00:00:00.000Z'),
        created_at: new Date('2026-09-01T00:00:00.000Z'),
        specimen: {
          accession_number: 'ENT-1',
          scientific_name: 'Papilio polytes',
          common_name: 'Common Mormon',
        },
        ar_asset: [{ is_enabled: true }, { is_enabled: false }],
        _count: { exhibit_media: 4 },
      },
    ]);

    const document = await service.build(
      context({ type: ReportType.QR_AR_EXHIBITS }),
    );

    expect(document.csvTable?.columns).toHaveLength(9);
    expect(printedDetail(document)?.rows).toEqual([
      [
        'Papilio polytes (Common Mormon)\nENT-1',
        'Published',
        'Sep 10, 2026',
        'Yes (2 assets)',
        4,
      ],
    ]);
  });

  it('filters exhibits by AR availability and excludes archived exhibits', async () => {
    prismaMock.exhibit.count.mockResolvedValue(0);
    prismaMock.exhibit.findMany.mockResolvedValue([]);

    await service.build(
      context({ type: ReportType.QR_AR_EXHIBITS, arEnabled: false }),
    );

    expect(prismaMock.exhibit.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        archived_at: null,
        ar_asset: { none: { is_enabled: true } },
      }),
    );
  });

  describe('audit log report', () => {
    beforeEach(() => {
      prismaMock.audit_log.count.mockResolvedValue(3);
      prismaMock.audit_log.findMany.mockResolvedValue([
        {
          created_at: new Date('2026-09-30T08:05:12.000Z'),
          module: 'auth',
          action: 'LOGIN',
          status: 'DENIED',
          affected_record_type: null,
          affected_record_id: null,
          details: { reason: 'inactive account' },
          user_account: { full_name: 'Test Curator', role: 'CURATOR' },
        },
        {
          created_at: new Date('2026-09-30T09:00:00.000Z'),
          module: 'reports',
          action: 'GENERATE_REPORT',
          status: 'SUCCESS',
          affected_record_type: 'report',
          affected_record_id: null,
          details: { reportType: 'INVENTORY', filters: { family: 'x' } },
          user_account: null,
        },
        {
          created_at: new Date('2026-09-30T10:00:00.000Z'),
          module: 'Reports',
          action: 'GENERATE_REPORT',
          status: 'FAILED',
          affected_record_type: 'report',
          affected_record_id: null,
          details: { error: 'x'.repeat(400) },
          user_account: null,
        },
      ]);
    });

    it('filters by period, module, action, and result, ignoring case', async () => {
      await service.build(
        context({
          type: ReportType.AUDIT_LOG,
          period: ReportPeriodType.MONTHLY,
          month: '2026-09',
          auditModule: 'auth',
          auditAction: 'login',
          auditResult: 'DENIED',
        }),
      );

      const { where } = prismaMock.audit_log.findMany.mock.calls[0][0];
      expect(where).toEqual({
        created_at: {
          gte: new Date('2026-08-31T16:00:00.000Z'),
          lt: new Date('2026-09-30T16:00:00.000Z'),
        },
        module: { equals: 'auth', mode: 'insensitive' },
        action: { equals: 'login', mode: 'insensitive' },
        status: 'DENIED',
      });
    });

    it('builds confidential rows with Philippine time and readable details', async () => {
      const document = await service.build(
        context({ type: ReportType.AUDIT_LOG }),
      );

      expect(document.confidential).toBe(true);
      expect(document.rowCount).toBe(3);
      expect(document.csvTable?.rows[0]).toEqual([
        'Sep 30, 2026, 4:05:12 PM',
        'Test Curator',
        'Curator',
        'auth',
        'LOGIN',
        'Denied',
        null,
        null,
        'reason: inactive account',
      ]);
      expect(document.csvTable?.rows[1].slice(1, 3)).toEqual([
        'No account',
        null,
      ]);
      expect(document.csvTable?.rows[1][8]).toBe(
        'reportType: INVENTORY; filters: {"family":"x"}',
      );
      const longDetail = document.csvTable?.rows[2][8] as string;
      expect(longDetail).toHaveLength(300);
      expect(longDetail.endsWith('…')).toBe(true);
      expect(printedDetail(document)?.rows.slice(0, 2)).toEqual([
        [
          'Sep 30, 2026, 4:05:12 PM',
          'Test Curator\nCurator',
          'auth\nLOGIN',
          'Denied',
          'reason: inactive account',
        ],
        [
          'Sep 30, 2026, 5:00:00 PM',
          'No account',
          'reports\nGENERATE_REPORT',
          'Success',
          'Record: report\nreportType: INVENTORY; filters: {"family":"x"}',
        ],
      ]);
      expect(tableRows(document, 'By result')).toEqual([
        ['Success', 1],
        ['Failed', 1],
        ['Denied', 1],
      ]);
      expect(tableRows(document, 'By module')).toEqual(
        expect.arrayContaining([
          ['auth', 1],
          [expect.stringMatching(/^reports$/i), 2],
        ]),
      );
    });

    it('refuses to export more than the detail row limit', async () => {
      prismaMock.audit_log.count.mockResolvedValue(MAX_REPORT_DETAIL_ROWS + 1);

      await expect(
        service.build(context({ type: ReportType.AUDIT_LOG })),
      ).rejects.toThrow(BadRequestException);
      expect(prismaMock.audit_log.findMany).not.toHaveBeenCalled();
    });
  });

  describe('consolidated report', () => {
    beforeEach(() => {
      prismaMock.specimen.groupBy.mockImplementation(({ by }) =>
        Promise.resolve(
          by[0] === 'status'
            ? [
                { status: 'CATALOGED', _count: { _all: 8 } },
                { status: 'ARCHIVED', _count: { _all: 1 } },
              ]
            : [
                { specimen_category: 'entomology', _count: { _all: 2 } },
                { specimen_category: 'Entomology', _count: { _all: 2 } },
                { specimen_category: null, _count: { _all: 1 } },
              ],
        ),
      );
      prismaMock.specimen_lot.groupBy.mockResolvedValue([]);
      prismaMock.specimen_lot.aggregate.mockResolvedValue({
        _count: { _all: 0 },
        _sum: { quantity: null },
      });
      prismaMock.specimen.count.mockResolvedValue(3);
      prismaMock.specimen_revision_history.count.mockResolvedValue(2);
      prismaMock.specimen_lot_transaction.groupBy.mockResolvedValue([]);
      prismaMock.inquiry.groupBy.mockResolvedValue([]);
      prismaMock.visit_request.groupBy.mockResolvedValue([]);
      prismaMock.exhibit.groupBy.mockResolvedValue([]);
      prismaMock.exhibit.count.mockResolvedValue(0);
    });

    it('covers every required section and scopes changes to the period', async () => {
      const document = await service.build(
        context({
          type: ReportType.CONSOLIDATED_OPERATIONS,
          period: ReportPeriodType.YEARLY,
          year: 2026,
          remarks: 'All cabinets inspected.',
        }),
      );

      const headings = document.blocks
        .filter((block) => block.kind === 'heading')
        .map((block) => block.text);
      expect(headings).toEqual([
        '1. Inventory Summary',
        '2. Inventory Changes During the Period',
        '3. General Inquiries',
        '4. Visit Requests',
        '5. QR and AR Exhibits',
        '6. Curator Remarks',
      ]);
      expect(document.blocks).toContainEqual({
        kind: 'paragraph',
        text: 'All cabinets inspected.',
      });
      expect(document.csvTable).toBeUndefined();
      expect(keyValue(document, 'Catalog completions')).toBe(2);
      expect(keyValue(document, 'Uncataloged')).toBe(0);
      expect(tableRows(document, 'Specimens by category')).toEqual([
        ['Entomology', 4],
        ['Uncategorized', 1],
      ]);
      expect(prismaMock.specimen_revision_history.count).toHaveBeenCalledWith({
        where: {
          field_changed: 'status',
          new_value: 'CATALOGED',
          changed_at: {
            gte: new Date('2025-12-31T16:00:00.000Z'),
            lt: new Date('2026-12-31T16:00:00.000Z'),
          },
        },
      });
    });

    it('notes when there are no curator remarks', async () => {
      const document = await service.build(
        context({
          type: ReportType.CONSOLIDATED_OPERATIONS,
          period: ReportPeriodType.MONTHLY,
          month: '2026-09',
        }),
      );

      expect(document.blocks.at(-1)).toEqual({
        kind: 'paragraph',
        text: 'No remarks provided.',
      });
    });
  });
});
