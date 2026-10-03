import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { resolveStorageLocations } from '../storage-locations/storage-location-paths';
import { findStorageSubtreeIds } from '../storage-locations/storage-subtree';
import type { GenerateReportDto } from './dto/generate-report.dto';
import type {
  ReportBlock,
  ReportCell,
  ReportDocument,
  ReportTable,
} from './report-document';
import {
  ADJUSTMENT_LABELS,
  EXHIBIT_STATUS_LABELS,
  formatDateOnly,
  formatReportDate,
  formatTimeOnly,
  INQUIRY_STATUS_LABELS,
  LOT_TRANSACTION_LABELS,
  SPECIMEN_STATUS_LABELS,
  VISIT_STATUS_LABELS,
} from './report-labels';
import { periodFilter, type ResolvedReportPeriod } from './report-period';
import { REPORT_DEFINITIONS, ReportType } from './report-types';

/**
 * Detail reports refuse to run past this many rows instead of silently
 * truncating, so an exported report is never incomplete (§4.7.2).
 */
export const MAX_REPORT_DETAIL_ROWS = 10_000;

export interface ReportContext {
  dto: GenerateReportDto;
  period: ResolvedReportPeriod;
  generatedAt: Date;
  generatedBy: string;
}

const insensitive = (value: string | undefined) =>
  value === undefined
    ? undefined
    : { equals: value, mode: Prisma.QueryMode.insensitive };

@Injectable()
export class ReportBuilderService {
  constructor(private readonly prisma: PrismaService) {}

  build(context: ReportContext): Promise<ReportDocument> {
    switch (context.dto.type) {
      case ReportType.CONSOLIDATED_OPERATIONS:
        return this.buildConsolidated(context);
      case ReportType.INVENTORY:
        return this.buildInventory(context);
      case ReportType.INQUIRY_SUMMARY:
        return this.buildInquirySummary(context);
      case ReportType.VISIT_REQUEST_SUMMARY:
        return this.buildVisitRequestSummary(context);
      case ReportType.QR_AR_EXHIBITS:
        return this.buildExhibitReport(context);
    }
  }

  // REQ-4.7-05, REQ-4.7-06
  private async buildConsolidated(
    context: ReportContext,
  ): Promise<ReportDocument> {
    const range = periodFilter(context.period);
    const notArchived = { status: { not: 'ARCHIVED' as const } };
    const [
      specimensByStatus,
      specimensByCategory,
      lotsByCondition,
      activeLotTotals,
      specimensAdded,
      catalogCompletions,
      specimensArchived,
      lotActivity,
      adjustments,
      inquiriesByStatus,
      inquiriesByType,
      visitsByStatus,
      exhibitsByStatus,
      arEnabledExhibits,
      exhibitsPublished,
    ] = await Promise.all([
      this.prisma.specimen.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.specimen.groupBy({
        by: ['specimen_category'],
        where: notArchived,
        _count: { _all: true },
      }),
      this.prisma.specimen_lot.groupBy({
        by: ['condition_class'],
        where: { is_active: true, specimen: notArchived },
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      this.prisma.specimen_lot.aggregate({
        where: { is_active: true, specimen: notArchived },
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      this.prisma.specimen.count({ where: { created_at: range } }),
      this.prisma.specimen_revision_history.count({
        where: {
          field_changed: 'status',
          new_value: 'CATALOGED',
          changed_at: range,
        },
      }),
      this.prisma.specimen.count({ where: { archived_at: range } }),
      this.prisma.specimen_lot_transaction.groupBy({
        by: ['transaction_type'],
        where: { created_at: range },
        _count: { _all: true },
        _sum: { quantity_affected: true },
      }),
      this.prisma.specimen_lot_transaction.groupBy({
        by: ['adjustment_type'],
        where: { created_at: range, transaction_type: 'QUANTITY_ADJUSTMENT' },
        _count: { _all: true },
        _sum: { quantity_affected: true },
      }),
      this.prisma.inquiry.groupBy({
        by: ['status'],
        where: { created_at: range },
        _count: { _all: true },
      }),
      this.prisma.inquiry.groupBy({
        by: ['inquiry_type'],
        where: { created_at: range },
        _count: { _all: true },
      }),
      this.prisma.visit_request.groupBy({
        by: ['status'],
        where: { created_at: range },
        _count: { _all: true },
        _sum: { visitor_count: true },
      }),
      this.prisma.exhibit.groupBy({
        by: ['status'],
        where: { archived_at: null },
        _count: { _all: true },
      }),
      this.prisma.exhibit.count({
        where: { archived_at: null, ar_asset: { some: { is_enabled: true } } },
      }),
      this.prisma.exhibit.count({ where: { published_at: range } }),
    ]);

    const specimenStatusCounts = countMap(
      specimensByStatus.map((row) => [row.status, row._count._all]),
    );
    const inquiryStatusCounts = countMap(
      inquiriesByStatus.map((row) => [row.status, row._count._all]),
    );
    const visitCounts = countMap(
      visitsByStatus.map((row) => [row.status, row._count._all]),
    );
    const visitorCounts = countMap(
      visitsByStatus.map((row) => [row.status, row._sum.visitor_count ?? 0]),
    );
    const exhibitCounts = countMap(
      exhibitsByStatus.map((row) => [row.status, row._count._all]),
    );
    const lotActivityCounts = countMap(
      lotActivity.map((row) => [row.transaction_type, row._count._all]),
    );
    const lotActivityQuantities = countMap(
      lotActivity.map((row) => [
        row.transaction_type,
        row._sum.quantity_affected ?? 0,
      ]),
    );
    const totalInquiries = sum(inquiriesByStatus.map((row) => row._count._all));
    const totalVisits = sum(visitsByStatus.map((row) => row._count._all));

    const blocks: ReportBlock[] = [
      heading('1. Inventory Summary'),
      paragraph(
        'Current totals as of report generation. Archived specimens are excluded from category and condition breakdowns.',
      ),
      keyValues([
        [
          'Total specimen records',
          sum(specimensByStatus.map((row) => row._count._all)),
        ],
        ...enumRows(SPECIMEN_STATUS_LABELS, specimenStatusCounts),
        ['Active lots', activeLotTotals._count._all],
        ['Total specimens in active lots', activeLotTotals._sum.quantity ?? 0],
      ]),
      table(
        'Specimens by category',
        ['Category', 'Specimen records'],
        mergeCaseInsensitive(
          specimensByCategory.map((row) => ({
            key: row.specimen_category ?? 'Uncategorized',
            values: [row._count._all],
          })),
        ),
      ),
      table(
        'Active lots by condition',
        ['Condition', 'Lots', 'Quantity'],
        mergeCaseInsensitive(
          lotsByCondition.map((row) => ({
            key: row.condition_class,
            values: [row._count._all, row._sum.quantity ?? 0],
          })),
        ),
      ),

      heading('2. Inventory Changes During the Period'),
      keyValues([
        ['Specimen records added', specimensAdded],
        ['Catalog completions', catalogCompletions],
        ['Specimen records archived', specimensArchived],
      ]),
      table(
        'Lot activity',
        ['Activity', 'Transactions', 'Quantity affected'],
        Object.entries(LOT_TRANSACTION_LABELS).map(([key, label]) => [
          label,
          lotActivityCounts.get(key) ?? 0,
          lotActivityQuantities.get(key) ?? 0,
        ]),
      ),
      table(
        'Quantity adjustments',
        ['Adjustment', 'Transactions', 'Quantity'],
        adjustments
          .filter((row) => row.adjustment_type !== null)
          .map((row): ReportCell[] => [
            ADJUSTMENT_LABELS[row.adjustment_type!],
            row._count._all,
            row._sum.quantity_affected ?? 0,
          ])
          .sort(byCountDesc),
      ),

      heading('3. General Inquiries'),
      keyValues([
        ['Inquiries received', totalInquiries],
        ...enumRows(INQUIRY_STATUS_LABELS, inquiryStatusCounts),
      ]),
      table(
        'Inquiries by type',
        ['Inquiry type', 'Inquiries'],
        mergeCaseInsensitive(
          inquiriesByType.map((row) => ({
            key: row.inquiry_type,
            values: [row._count._all],
          })),
        ),
      ),

      heading('4. Visit Requests'),
      keyValues([
        ['Visit requests received', totalVisits],
        ['Visitors requested', sum([...visitorCounts.values()])],
        ['Visitors in completed visits', visitorCounts.get('COMPLETED') ?? 0],
      ]),
      table(
        'Visit requests by status',
        ['Status', 'Requests', 'Visitors'],
        Object.entries(VISIT_STATUS_LABELS).map(([key, label]) => [
          label,
          visitCounts.get(key) ?? 0,
          visitorCounts.get(key) ?? 0,
        ]),
      ),

      heading('5. QR and AR Exhibits'),
      paragraph(
        'Current exhibit totals as of report generation; archived exhibits are excluded.',
      ),
      keyValues([
        ...enumRows(EXHIBIT_STATUS_LABELS, exhibitCounts),
        ['AR-enabled exhibits', arEnabledExhibits],
        ['Exhibits published during the period', exhibitsPublished],
      ]),

      heading('6. Curator Remarks'),
      paragraph(context.dto.remarks ?? 'No remarks provided.'),
    ];

    return this.document(context, { blocks, confidential: false, rowCount: 0 });
  }

  // REQ-4.7-07
  private async buildInventory(
    context: ReportContext,
  ): Promise<ReportDocument> {
    const { dto } = context;

    let storageUnitIds: string[] | undefined;
    if (dto.storageUnitId) {
      const unit = await this.prisma.storage_unit.findUnique({
        where: { id: dto.storageUnitId },
        select: { id: true },
      });
      if (!unit) {
        throw new BadRequestException(
          'The selected storage location does not exist.',
        );
      }
      storageUnitIds =
        dto.includeDescendantUnits === false
          ? [dto.storageUnitId]
          : await findStorageSubtreeIds(this.prisma, dto.storageUnitId);
    }

    const taxonomy: Prisma.specimen_taxonomyWhereInput = {
      kingdom: insensitive(dto.kingdom),
      phylum: insensitive(dto.phylum),
      class: insensitive(dto.taxonClass),
      order_name: insensitive(dto.taxonOrder),
      family: insensitive(dto.family),
      genus: insensitive(dto.genus),
      species: insensitive(dto.species),
    };
    const hasTaxonomyFilter = Object.values(taxonomy).some(Boolean);
    const hasLotFilter = Boolean(dto.conditionClass || storageUnitIds);

    const where: Prisma.specimenWhereInput = {
      status: dto.specimenStatus,
      specimen_category: insensitive(dto.category),
      public_display_allowed: dto.publicDisplay,
      created_at: periodFilter(context.period),
      specimen_taxonomy: hasTaxonomyFilter ? { is: taxonomy } : undefined,
      // One active lot must satisfy both the condition and location filters.
      specimen_lot: hasLotFilter
        ? {
            some: {
              is_active: true,
              condition_class: insensitive(dto.conditionClass),
              storage_unit_id: storageUnitIds
                ? { in: storageUnitIds }
                : undefined,
            },
          }
        : undefined,
    };

    this.assertWithinLimit(
      await this.prisma.specimen.count({ where }),
      'specimens',
    );
    const specimens = await this.prisma.specimen.findMany({
      where,
      orderBy: [
        { accession_number: { sort: 'asc', nulls: 'last' } },
        { created_at: 'asc' },
      ],
      select: {
        accession_number: true,
        scientific_name: true,
        common_name: true,
        specimen_category: true,
        status: true,
        classification_status: true,
        public_display_allowed: true,
        created_at: true,
        collection: { select: { collection_name: true } },
        specimen_taxonomy: { select: { family: true } },
        specimen_lot: {
          where: { is_active: true },
          select: {
            quantity: true,
            condition_class: true,
            storage_unit_id: true,
          },
        },
      },
    });

    const locations = await resolveStorageLocations(this.prisma, [
      ...(dto.storageUnitId ? [dto.storageUnitId] : []),
      ...specimens.flatMap((specimen) =>
        specimen.specimen_lot.map((lot) => lot.storage_unit_id),
      ),
    ]);
    const storagePath = (unitId: string) =>
      locations.get(unitId)?.pathLabel ?? 'Unknown location';

    const statusCounts = new Map<string, number>();
    const categoryCounts: { key: string; values: number[] }[] = [];
    const conditionTotals: { key: string; values: number[] }[] = [];
    let totalQuantity = 0;
    let totalLots = 0;

    const rows = specimens.map((specimen): ReportCell[] => {
      increment(statusCounts, specimen.status);
      categoryCounts.push({
        key: specimen.specimen_category ?? 'Uncategorized',
        values: [1],
      });
      const quantity = sum(specimen.specimen_lot.map((lot) => lot.quantity));
      totalQuantity += quantity;
      totalLots += specimen.specimen_lot.length;
      for (const lot of specimen.specimen_lot) {
        conditionTotals.push({
          key: lot.condition_class,
          values: [1, lot.quantity],
        });
      }
      return [
        specimen.accession_number,
        specimen.scientific_name,
        specimen.common_name,
        specimen.specimen_category,
        specimen.collection?.collection_name ?? null,
        specimen.specimen_taxonomy?.family ?? null,
        SPECIMEN_STATUS_LABELS[specimen.status],
        specimen.classification_status,
        specimen.public_display_allowed ? 'Yes' : 'No',
        quantity,
        distinctCaseInsensitive(
          specimen.specimen_lot.map((lot) => lot.condition_class),
        ).join('; ') || null,
        distinct(
          specimen.specimen_lot.map((lot) => storagePath(lot.storage_unit_id)),
        ).join('; ') || null,
        formatReportDate(specimen.created_at),
      ];
    });

    const detail: ReportTable = {
      columns: [
        'Accession No.',
        'Scientific Name',
        'Common Name',
        'Category',
        'Collection',
        'Family',
        'Status',
        'Classification',
        'Public Display',
        'Active Qty',
        'Condition',
        'Storage Location',
        'Date Added',
      ],
      rows,
    };

    const filters = this.describeFilters(context, {
      'Specimen status':
        dto.specimenStatus && SPECIMEN_STATUS_LABELS[dto.specimenStatus],
      Category: dto.category,
      Kingdom: dto.kingdom,
      Phylum: dto.phylum,
      Class: dto.taxonClass,
      Order: dto.taxonOrder,
      Family: dto.family,
      Genus: dto.genus,
      Species: dto.species,
      Condition: dto.conditionClass,
      'Storage location': dto.storageUnitId
        ? `${storagePath(dto.storageUnitId)}${dto.includeDescendantUnits === false ? '' : ' (including sub-locations)'}`
        : undefined,
      'Public display':
        dto.publicDisplay === undefined
          ? undefined
          : dto.publicDisplay
            ? 'Allowed'
            : 'Not allowed',
    });

    const blocks: ReportBlock[] = [
      heading('Report Scope'),
      filters,
      heading('Summary'),
      keyValues([
        ['Specimen records', specimens.length],
        ['Active lots', totalLots],
        ['Total specimens in active lots', totalQuantity],
      ]),
      table(
        'By status',
        ['Status', 'Specimen records'],
        enumRows(SPECIMEN_STATUS_LABELS, statusCounts),
      ),
      table(
        'By category',
        ['Category', 'Specimen records'],
        mergeCaseInsensitive(categoryCounts),
      ),
      table(
        'Active lots by condition',
        ['Condition', 'Lots', 'Quantity'],
        mergeCaseInsensitive(conditionTotals),
      ),
      heading('Specimen Inventory'),
      { kind: 'table', table: detail },
    ];

    return this.document(context, {
      blocks,
      confidential: true,
      csvTable: detail,
      rowCount: rows.length,
    });
  }

  // REQ-4.7-08
  private async buildInquirySummary(
    context: ReportContext,
  ): Promise<ReportDocument> {
    const { dto } = context;
    const where: Prisma.inquiryWhereInput = {
      created_at: periodFilter(context.period),
      status: dto.inquiryStatus,
      inquiry_type: insensitive(dto.inquiryType),
    };
    this.assertWithinLimit(
      await this.prisma.inquiry.count({ where }),
      'inquiries',
    );
    const inquiries = await this.prisma.inquiry.findMany({
      where,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        created_at: true,
        full_name: true,
        organization_name: true,
        email_address: true,
        contact_number: true,
        inquiry_type: true,
        status: true,
        user_account: { select: { full_name: true } },
      },
    });

    const statusCounts = new Map<string, number>();
    const detail: ReportTable = {
      columns: [
        'Received',
        'Name',
        'Organization',
        'Email',
        'Contact No.',
        'Inquiry Type',
        'Status',
        'Reviewed By',
      ],
      rows: inquiries.map((inquiry): ReportCell[] => {
        increment(statusCounts, inquiry.status);
        return [
          formatReportDate(inquiry.created_at),
          inquiry.full_name,
          inquiry.organization_name,
          inquiry.email_address,
          inquiry.contact_number,
          inquiry.inquiry_type,
          INQUIRY_STATUS_LABELS[inquiry.status],
          inquiry.user_account?.full_name ?? null,
        ];
      }),
    };

    const blocks: ReportBlock[] = [
      heading('Report Scope'),
      this.describeFilters(context, {
        Status: dto.inquiryStatus && INQUIRY_STATUS_LABELS[dto.inquiryStatus],
        'Inquiry type': dto.inquiryType,
      }),
      heading('Summary'),
      keyValues([['Inquiries', inquiries.length]]),
      table(
        'By status',
        ['Status', 'Inquiries'],
        enumRows(INQUIRY_STATUS_LABELS, statusCounts),
      ),
      table(
        'By inquiry type',
        ['Inquiry type', 'Inquiries'],
        mergeCaseInsensitive(
          inquiries.map((inquiry) => ({
            key: inquiry.inquiry_type,
            values: [1],
          })),
        ),
      ),
      heading('Inquiry Details'),
      { kind: 'table', table: detail },
    ];

    return this.document(context, {
      blocks,
      confidential: true,
      csvTable: detail,
      rowCount: detail.rows.length,
    });
  }

  // REQ-4.7-09
  private async buildVisitRequestSummary(
    context: ReportContext,
  ): Promise<ReportDocument> {
    const { dto } = context;
    const where: Prisma.visit_requestWhereInput = {
      created_at: periodFilter(context.period),
      status: dto.visitStatus,
    };
    this.assertWithinLimit(
      await this.prisma.visit_request.count({ where }),
      'visit requests',
    );
    const visits = await this.prisma.visit_request.findMany({
      where,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        created_at: true,
        contact_person: true,
        organization_name: true,
        email_address: true,
        contact_number: true,
        visitor_count: true,
        status: true,
        approved_date: true,
        approved_start_time: true,
        approved_end_time: true,
        user_account: { select: { full_name: true } },
      },
    });

    const statusCounts = new Map<string, number>();
    const visitorCounts = new Map<string, number>();
    const detail: ReportTable = {
      columns: [
        'Submitted',
        'Contact Person',
        'Organization',
        'Email',
        'Contact No.',
        'Visitors',
        'Status',
        'Approved Schedule',
        'Reviewed By',
      ],
      rows: visits.map((visit): ReportCell[] => {
        increment(statusCounts, visit.status);
        increment(visitorCounts, visit.status, visit.visitor_count);
        return [
          formatReportDate(visit.created_at),
          visit.contact_person,
          visit.organization_name,
          visit.email_address,
          visit.contact_number,
          visit.visitor_count,
          VISIT_STATUS_LABELS[visit.status],
          visit.approved_date
            ? `${formatDateOnly(visit.approved_date)}${
                visit.approved_start_time && visit.approved_end_time
                  ? ` ${formatTimeOnly(visit.approved_start_time)}-${formatTimeOnly(visit.approved_end_time)}`
                  : ''
              }`
            : null,
          visit.user_account?.full_name ?? null,
        ];
      }),
    };

    const blocks: ReportBlock[] = [
      heading('Report Scope'),
      this.describeFilters(context, {
        Status: dto.visitStatus && VISIT_STATUS_LABELS[dto.visitStatus],
      }),
      heading('Summary'),
      keyValues([
        ['Visit requests', visits.length],
        ['Visitors requested', sum(visits.map((visit) => visit.visitor_count))],
        ['Visitors in completed visits', visitorCounts.get('COMPLETED') ?? 0],
      ]),
      table(
        'By status',
        ['Status', 'Requests', 'Visitors'],
        Object.entries(VISIT_STATUS_LABELS).map(([key, label]) => [
          label,
          statusCounts.get(key) ?? 0,
          visitorCounts.get(key) ?? 0,
        ]),
      ),
      heading('Visit-Request Details'),
      { kind: 'table', table: detail },
    ];

    return this.document(context, {
      blocks,
      confidential: true,
      csvTable: detail,
      rowCount: detail.rows.length,
    });
  }

  // REQ-4.7-10
  private async buildExhibitReport(
    context: ReportContext,
  ): Promise<ReportDocument> {
    const { dto } = context;
    const where: Prisma.exhibitWhereInput = {
      archived_at: null,
      created_at: periodFilter(context.period),
      status: dto.exhibitStatus,
      ar_asset:
        dto.arEnabled === undefined
          ? undefined
          : dto.arEnabled
            ? { some: { is_enabled: true } }
            : { none: { is_enabled: true } },
    };
    this.assertWithinLimit(
      await this.prisma.exhibit.count({ where }),
      'exhibits',
    );
    const exhibits = await this.prisma.exhibit.findMany({
      where,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      select: {
        public_slug: true,
        status: true,
        published_at: true,
        created_at: true,
        specimen: {
          select: {
            accession_number: true,
            scientific_name: true,
            common_name: true,
          },
        },
        ar_asset: { select: { is_enabled: true } },
        _count: { select: { exhibit_media: true } },
      },
    });

    const statusCounts = new Map<string, number>();
    let arEnabledCount = 0;
    const detail: ReportTable = {
      columns: [
        'Specimen',
        'Accession No.',
        'Public Slug',
        'Status',
        'Published',
        'AR Enabled',
        'AR Assets',
        'Media',
        'Created',
      ],
      rows: exhibits.map((exhibit): ReportCell[] => {
        increment(statusCounts, exhibit.status);
        const arEnabled = exhibit.ar_asset.some((asset) => asset.is_enabled);
        if (arEnabled) arEnabledCount += 1;
        return [
          specimenName(exhibit.specimen),
          exhibit.specimen.accession_number,
          exhibit.public_slug,
          EXHIBIT_STATUS_LABELS[exhibit.status],
          formatReportDate(exhibit.published_at),
          arEnabled ? 'Yes' : 'No',
          exhibit.ar_asset.length,
          exhibit._count.exhibit_media,
          formatReportDate(exhibit.created_at),
        ];
      }),
    };

    const blocks: ReportBlock[] = [
      heading('Report Scope'),
      this.describeFilters(
        context,
        {
          Status: dto.exhibitStatus && EXHIBIT_STATUS_LABELS[dto.exhibitStatus],
          AR:
            dto.arEnabled === undefined
              ? undefined
              : dto.arEnabled
                ? 'AR-enabled only'
                : 'Without enabled AR',
        },
        'Archived exhibits are excluded.',
      ),
      heading('Summary'),
      keyValues([
        ['Exhibit pages', exhibits.length],
        ...enumRows(EXHIBIT_STATUS_LABELS, statusCounts),
        ['AR-enabled', arEnabledCount],
      ]),
      heading('Exhibit Details'),
      { kind: 'table', table: detail },
    ];

    return this.document(context, {
      blocks,
      confidential: false,
      csvTable: detail,
      rowCount: detail.rows.length,
    });
  }

  private document(
    context: ReportContext,
    content: Pick<
      ReportDocument,
      'blocks' | 'confidential' | 'csvTable' | 'rowCount'
    >,
  ): ReportDocument {
    return {
      title: REPORT_DEFINITIONS[context.dto.type].title,
      periodLabel: context.period.label,
      generatedAt: context.generatedAt,
      generatedBy: context.generatedBy,
      ...content,
    };
  }

  private describeFilters(
    context: ReportContext,
    filters: Record<string, string | undefined>,
    note?: string,
  ): ReportBlock {
    const applied = Object.entries(filters).filter(
      (entry): entry is [string, string] => Boolean(entry[1]),
    );
    return keyValues([
      ['Period', context.period.label],
      [
        'Period applies to',
        REPORT_DEFINITIONS[context.dto.type].periodAppliesTo,
      ],
      ...(applied.length > 0
        ? applied
        : [['Filters', 'None'] as [string, string]]),
      ...(note ? [['Note', note] as [string, string]] : []),
    ]);
  }

  private assertWithinLimit(count: number, noun: string): void {
    if (count > MAX_REPORT_DETAIL_ROWS) {
      throw new BadRequestException(
        `This report would include ${count.toLocaleString('en-US')} ${noun}, more than the ` +
          `${MAX_REPORT_DETAIL_ROWS.toLocaleString('en-US')} a single report can hold. ` +
          'Narrow the period or filters and try again.',
      );
    }
  }
}

// ---- helpers -------------------------------------------------------------

function heading(text: string): ReportBlock {
  return { kind: 'heading', text };
}

function paragraph(text: string): ReportBlock {
  return { kind: 'paragraph', text };
}

function keyValues(items: [string, ReportCell][]): ReportBlock {
  return {
    kind: 'keyValues',
    items: items.map(([label, value]) => ({ label, value })),
  };
}

function table(
  title: string,
  columns: string[],
  rows: ReportCell[][],
): ReportBlock {
  return { kind: 'table', table: { title, columns, rows } };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function increment(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function countMap(entries: [string, number][]): Map<string, number> {
  const map = new Map<string, number>();
  for (const [key, value] of entries) increment(map, key, value);
  return map;
}

/** One row per enum value, in declaration order, including zero counts. */
function enumRows(
  labels: Record<string, string>,
  counts: Map<string, number>,
): [string, number][] {
  return Object.entries(labels).map(([key, label]) => [
    label,
    counts.get(key) ?? 0,
  ]);
}

function byCountDesc(a: ReportCell[], b: ReportCell[]): number {
  return (
    Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0]))
  );
}

/**
 * Categories, condition classes, and inquiry types are free text, so "Good"
 * and "good" are merged into one row. The row is labelled with the most
 * common spelling, preferring a capitalized one on ties.
 */
function mergeCaseInsensitive(
  entries: { key: string; values: number[] }[],
): ReportCell[][] {
  const merged = new Map<
    string,
    { spellings: Map<string, number>; values: number[] }
  >();
  for (const entry of entries) {
    const spelling = entry.key.trim();
    const normalized = spelling.toLowerCase();
    let row = merged.get(normalized);
    if (!row) {
      row = { spellings: new Map(), values: [] };
      merged.set(normalized, row);
    }
    increment(row.spellings, spelling, entry.values[0] ?? 0);
    entry.values.forEach((value, index) => {
      row.values[index] = (row.values[index] ?? 0) + value;
    });
  }
  return [...merged.values()]
    .map((row): ReportCell[] => [
      preferredSpelling(row.spellings),
      ...row.values,
    ])
    .sort(byCountDesc);
}

function preferredSpelling(spellings: Map<string, number>): string {
  let best = '';
  let bestWeight = -1;
  for (const [spelling, weight] of spellings) {
    const capitalized = /^\p{Lu}/u.test(spelling);
    const bestCapitalized = /^\p{Lu}/u.test(best);
    if (
      weight > bestWeight ||
      (weight === bestWeight && capitalized && !bestCapitalized)
    ) {
      best = spelling;
      bestWeight = weight;
    }
  }
  return best;
}

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

function distinctCaseInsensitive(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!seen.has(key)) seen.set(key, value.trim());
  }
  return [...seen.values()];
}

function specimenName(specimen: {
  scientific_name: string | null;
  common_name: string | null;
}): string | null {
  if (specimen.scientific_name && specimen.common_name) {
    return `${specimen.scientific_name} (${specimen.common_name})`;
  }
  return specimen.scientific_name ?? specimen.common_name;
}
