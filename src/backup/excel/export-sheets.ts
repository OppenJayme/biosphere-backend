import { Prisma } from '../../generated/prisma/client';
import { referenceCode } from '../../mail/visitor-email';
import type { XlsxCell } from '../../common/excel/xlsx-writer';

/**
 * Worksheets of the weekly Excel export (spec 0003, Feature design). Each
 * column has a fixed label; `personal` columns hold visitor personal data
 * and are written only when listed in the approved field set (AC-2a).
 */
export interface ExportColumn<Row> {
  label: string;
  personal?: boolean;
  value: (row: Row) => XlsxCell;
}

export interface ExportSheet<Row = unknown> {
  name: string;
  columns: ExportColumn<Row>[];
  rows: Row[];
  /** Count of the source table in the same snapshot (AC-3). */
  sourceCount: number;
}

/** A child-sheet column that must match an ID in its parent sheet (AC-3b). */
export interface ExportRelation {
  sheet: string;
  column: string;
  parentSheet: string;
  parentColumn: string;
}

export const EXPORT_RELATIONS: ExportRelation[] = [
  {
    sheet: 'Specimens',
    column: 'Collection ID',
    parentSheet: 'Collections',
    parentColumn: 'ID',
  },
  {
    sheet: 'Lots',
    column: 'Specimen ID',
    parentSheet: 'Specimens',
    parentColumn: 'ID',
  },
  {
    sheet: 'Lots',
    column: 'Storage unit ID',
    parentSheet: 'Storage units',
    parentColumn: 'ID',
  },
  {
    sheet: 'Storage units',
    column: 'Parent ID',
    parentSheet: 'Storage units',
    parentColumn: 'ID',
  },
  {
    sheet: 'Inquiries',
    column: 'Linked visit request ID',
    parentSheet: 'Visit requests',
    parentColumn: 'ID',
  },
  {
    sheet: 'Visit requests',
    column: 'Source inquiry ID',
    parentSheet: 'Inquiries',
    parentColumn: 'ID',
  },
  {
    sheet: 'Preferred dates',
    column: 'Visit request ID',
    parentSheet: 'Visit requests',
    parentColumn: 'ID',
  },
  {
    sheet: 'Visitors',
    column: 'Visit request ID',
    parentSheet: 'Visit requests',
    parentColumn: 'ID',
  },
  {
    sheet: 'Vehicles',
    column: 'Visit request ID',
    parentSheet: 'Visit requests',
    parentColumn: 'ID',
  },
  {
    sheet: 'Correspondence',
    column: 'Inquiry ID',
    parentSheet: 'Inquiries',
    parentColumn: 'ID',
  },
  {
    sheet: 'Correspondence',
    column: 'Visit request ID',
    parentSheet: 'Visit requests',
    parentColumn: 'ID',
  },
];

const MANILA = 'Asia/Manila';
const dateTimeFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANILA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Timestamp as Manila "YYYY-MM-DD HH:mm" text, so no app shifts it. */
export function manilaDateTime(value: Date | null | undefined): string | null {
  if (!value) return null;
  const parts = Object.fromEntries(
    dateTimeFormat.formatToParts(value).map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/** A @db.Date column (stored at UTC midnight) as "YYYY-MM-DD". */
export function dateOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** A @db.Time column (stored on 1970-01-01 UTC) as "HH:mm". */
export function timeOnly(value: Date | null | undefined): string | null {
  return value ? value.toISOString().slice(11, 16) : null;
}

const yesNo = (value: boolean | null | undefined): string | null =>
  value === null || value === undefined ? null : value ? 'Yes' : 'No';

/** Loads every sheet from one snapshot transaction. */
export async function loadExportSheets(
  tx: Prisma.TransactionClient,
): Promise<ExportSheet[]> {
  const [
    specimens,
    specimenCount,
    lots,
    lotCount,
    units,
    unitCount,
    collections,
    collectionCount,
    inquiries,
    inquiryCount,
    visits,
    visitCount,
    preferred,
    preferredCount,
    visitors,
    visitorCount,
    vehicles,
    vehicleCount,
    history,
    historyCount,
  ] = [
    await tx.specimen.findMany({
      include: {
        collection: { select: { collection_name: true } },
        specimen_taxonomy: true,
        specimen_provenance: true,
        specimen_tag: { include: { tag: { select: { tag_name: true } } } },
      },
      orderBy: [{ accession_number: 'asc' }, { id: 'asc' }],
    }),
    await tx.specimen.count(),
    await tx.specimen_lot.findMany({
      include: { specimen: { select: { accession_number: true } } },
      orderBy: [{ specimen_id: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
    }),
    await tx.specimen_lot.count(),
    await tx.storage_unit.findMany({
      orderBy: [{ label: 'asc' }, { id: 'asc' }],
    }),
    await tx.storage_unit.count(),
    await tx.collection.findMany({
      include: { _count: { select: { specimen: true } } },
      orderBy: [{ collection_name: 'asc' }, { id: 'asc' }],
    }),
    await tx.collection.count(),
    await tx.inquiry.findMany({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    }),
    await tx.inquiry.count(),
    await tx.visit_request.findMany({
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    }),
    await tx.visit_request.count(),
    await tx.preferred_visit_date.findMany({
      orderBy: [
        { visit_id: 'asc' },
        { preference_order: 'asc' },
        { id: 'asc' },
      ],
    }),
    await tx.preferred_visit_date.count(),
    await tx.visit_request_visitor.findMany({
      orderBy: [{ visit_id: 'asc' }, { id: 'asc' }],
    }),
    await tx.visit_request_visitor.count(),
    await tx.visit_request_vehicle.findMany({
      include: { visit_request_visitor: { select: { visitor_name: true } } },
      orderBy: [{ visit_id: 'asc' }, { id: 'asc' }],
    }),
    await tx.visit_request_vehicle.count(),
    await tx.communication_history.findMany({
      include: { user_account: { select: { full_name: true } } },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    }),
    await tx.communication_history.count(),
  ];

  // Full storage path ("Cabinet A > Shelf 2"), guarded against cycles.
  const unitById = new Map(units.map((u) => [u.id, u]));
  const pathOf = (id: string | null): string | null => {
    if (!id) return null;
    const labels: string[] = [];
    const seen = new Set<string>();
    let current = unitById.get(id);
    while (current && !seen.has(current.id)) {
      seen.add(current.id);
      labels.unshift(current.label);
      current = current.parent_id ? unitById.get(current.parent_id) : undefined;
    }
    return labels.join(' > ');
  };
  const visitByInquiry = new Map(
    visits
      .filter((v) => v.source_inquiry_id)
      .map((v) => [v.source_inquiry_id!, v.id]),
  );

  type S = (typeof specimens)[number];
  type L = (typeof lots)[number];
  type U = (typeof units)[number];
  type C = (typeof collections)[number];
  type I = (typeof inquiries)[number];
  type V = (typeof visits)[number];
  type P = (typeof preferred)[number];
  type VV = (typeof visitors)[number];
  type VH = (typeof vehicles)[number];
  type H = (typeof history)[number];

  const specimenSheet: ExportSheet<S> = {
    name: 'Specimens',
    sourceCount: specimenCount,
    rows: specimens,
    columns: [
      { label: 'ID', value: (s) => s.id },
      { label: 'Accession number', value: (s) => s.accession_number },
      { label: 'Category', value: (s) => s.specimen_category },
      { label: 'Scientific name', value: (s) => s.scientific_name },
      { label: 'Common name', value: (s) => s.common_name },
      { label: 'Sex', value: (s) => s.gender },
      { label: 'Classification status', value: (s) => s.classification_status },
      { label: 'Status', value: (s) => s.status },
      {
        label: 'Public display allowed',
        value: (s) => yesNo(s.public_display_allowed),
      },
      { label: 'Collection ID', value: (s) => s.collection_id },
      {
        label: 'Collection',
        value: (s) => s.collection?.collection_name ?? null,
      },
      {
        label: 'Tags',
        value: (s) =>
          s.specimen_tag
            .map((t) => t.tag.tag_name)
            .sort()
            .join(', ') || null,
      },
      { label: 'Kingdom', value: (s) => s.specimen_taxonomy?.kingdom ?? null },
      { label: 'Phylum', value: (s) => s.specimen_taxonomy?.phylum ?? null },
      { label: 'Class', value: (s) => s.specimen_taxonomy?.class ?? null },
      { label: 'Order', value: (s) => s.specimen_taxonomy?.order_name ?? null },
      { label: 'Family', value: (s) => s.specimen_taxonomy?.family ?? null },
      { label: 'Genus', value: (s) => s.specimen_taxonomy?.genus ?? null },
      { label: 'Species', value: (s) => s.specimen_taxonomy?.species ?? null },
      { label: 'Habitat', value: (s) => s.specimen_taxonomy?.habitat ?? null },
      {
        label: 'Ecological role',
        value: (s) => s.specimen_taxonomy?.ecological_role ?? null,
      },
      {
        label: 'Conservation status',
        value: (s) => s.specimen_taxonomy?.conservation_status ?? null,
      },
      {
        label: 'Collector',
        value: (s) => s.specimen_provenance?.collector ?? null,
      },
      { label: 'Donor', value: (s) => s.specimen_provenance?.donor ?? null },
      {
        label: 'Collection date',
        value: (s) => dateOnly(s.specimen_provenance?.collection_date),
      },
      {
        label: 'Collection location',
        value: (s) => s.specimen_provenance?.collection_location ?? null,
      },
      {
        label: 'Preservation type',
        value: (s) => s.specimen_provenance?.preservation_type ?? null,
      },
      {
        label: 'Preservation method',
        value: (s) => s.specimen_provenance?.preservation_method ?? null,
      },
      { label: 'Remarks', value: (s) => s.remarks },
      { label: 'Created', value: (s) => manilaDateTime(s.created_at) },
      { label: 'Updated', value: (s) => manilaDateTime(s.updated_at) },
      { label: 'Archived', value: (s) => manilaDateTime(s.archived_at) },
    ],
  };

  const lotSheet: ExportSheet<L> = {
    name: 'Lots',
    sourceCount: lotCount,
    rows: lots,
    columns: [
      { label: 'ID', value: (l) => l.id },
      { label: 'Specimen ID', value: (l) => l.specimen_id },
      { label: 'Accession number', value: (l) => l.specimen.accession_number },
      { label: 'Storage unit ID', value: (l) => l.storage_unit_id },
      { label: 'Storage path', value: (l) => pathOf(l.storage_unit_id) },
      { label: 'Condition', value: (l) => l.condition_class },
      { label: 'Quantity', value: (l) => l.quantity },
      { label: 'Storage notes', value: (l) => l.storage_notes },
      { label: 'Active', value: (l) => yesNo(l.is_active) },
      { label: 'Created', value: (l) => manilaDateTime(l.created_at) },
      { label: 'Updated', value: (l) => manilaDateTime(l.updated_at) },
    ],
  };

  const unitSheet: ExportSheet<U> = {
    name: 'Storage units',
    sourceCount: unitCount,
    rows: units,
    columns: [
      { label: 'ID', value: (u) => u.id },
      { label: 'Parent ID', value: (u) => u.parent_id },
      { label: 'Full path', value: (u) => pathOf(u.id) },
      { label: 'Unit type', value: (u) => u.unit_type },
      { label: 'Label', value: (u) => u.label },
      { label: 'Size', value: (u) => u.size },
      { label: 'Storage type', value: (u) => u.storage_type },
      { label: 'Holds specimens', value: (u) => yesNo(u.holds_specimens) },
      { label: 'Capacity', value: (u) => u.capacity },
      { label: 'Archived', value: (u) => manilaDateTime(u.archived_at) },
    ],
  };

  const collectionSheet: ExportSheet<C> = {
    name: 'Collections',
    sourceCount: collectionCount,
    rows: collections,
    columns: [
      { label: 'ID', value: (c) => c.id },
      { label: 'Name', value: (c) => c.collection_name },
      { label: 'Specimen count', value: (c) => c._count.specimen },
    ],
  };

  const inquirySheet: ExportSheet<I> = {
    name: 'Inquiries',
    sourceCount: inquiryCount,
    rows: inquiries,
    columns: [
      { label: 'ID', value: (i) => i.id },
      { label: 'Reference code', value: (i) => referenceCode(i.id) },
      { label: 'Type', value: (i) => i.inquiry_type },
      { label: 'Status', value: (i) => i.status },
      { label: 'Visit reference given', value: (i) => i.visit_reference_code },
      {
        label: 'Linked visit request ID',
        value: (i) => visitByInquiry.get(i.id) ?? null,
      },
      {
        label: 'Has attachment',
        value: (i) => yesNo(i.attachment_path !== null),
      },
      {
        label: 'Consent accepted',
        value: (i) => manilaDateTime(i.consent_accepted_at),
      },
      { label: 'Created', value: (i) => manilaDateTime(i.created_at) },
      { label: 'Updated', value: (i) => manilaDateTime(i.updated_at) },
      { label: 'Full name', personal: true, value: (i) => i.full_name },
      { label: 'Email', personal: true, value: (i) => i.email_address },
      {
        label: 'Contact number',
        personal: true,
        value: (i) => i.contact_number,
      },
      {
        label: 'Organization',
        personal: true,
        value: (i) => i.organization_name,
      },
      { label: 'Message', personal: true, value: (i) => i.message },
    ],
  };

  const visitSheet: ExportSheet<V> = {
    name: 'Visit requests',
    sourceCount: visitCount,
    rows: visits,
    columns: [
      { label: 'ID', value: (v) => v.id },
      { label: 'Reference code', value: (v) => referenceCode(v.id) },
      { label: 'Status', value: (v) => v.status },
      { label: 'Visitor count', value: (v) => v.visitor_count },
      { label: 'Approved date', value: (v) => dateOnly(v.approved_date) },
      {
        label: 'Approved start',
        value: (v) => timeOnly(v.approved_start_time),
      },
      { label: 'Approved end', value: (v) => timeOnly(v.approved_end_time) },
      { label: 'Source inquiry ID', value: (v) => v.source_inquiry_id },
      {
        label: 'Consent accepted',
        value: (v) => manilaDateTime(v.consent_accepted_at),
      },
      { label: 'Created', value: (v) => manilaDateTime(v.created_at) },
      { label: 'Updated', value: (v) => manilaDateTime(v.updated_at) },
      {
        label: 'Contact person',
        personal: true,
        value: (v) => v.contact_person,
      },
      { label: 'Email', personal: true, value: (v) => v.email_address },
      {
        label: 'Contact number',
        personal: true,
        value: (v) => v.contact_number,
      },
      {
        label: 'Organization',
        personal: true,
        value: (v) => v.organization_name,
      },
      { label: 'Address', personal: true, value: (v) => v.address },
      { label: 'Purpose', personal: true, value: (v) => v.purpose_of_visit },
      {
        label: 'Miscellaneous details',
        personal: true,
        value: (v) => v.miscellaneous_details,
      },
      {
        label: 'Additional notes',
        personal: true,
        value: (v) => v.additional_notes,
      },
    ],
  };

  const preferredSheet: ExportSheet<P> = {
    name: 'Preferred dates',
    sourceCount: preferredCount,
    rows: preferred,
    columns: [
      { label: 'Visit request ID', value: (p) => p.visit_id },
      { label: 'Order', value: (p) => p.preference_order },
      { label: 'Date', value: (p) => dateOnly(p.preferred_date) },
      { label: 'Start', value: (p) => timeOnly(p.preferred_start_time) },
      { label: 'End', value: (p) => timeOnly(p.preferred_end_time) },
    ],
  };

  const visitorSheet: ExportSheet<VV> = {
    name: 'Visitors',
    sourceCount: visitorCount,
    rows: visitors,
    columns: [
      { label: 'Visit request ID', value: (v) => v.visit_id },
      { label: 'Visitor type', value: (v) => v.visitor_type },
      { label: 'Name', personal: true, value: (v) => v.visitor_name },
    ],
  };

  const vehicleSheet: ExportSheet<VH> = {
    name: 'Vehicles',
    sourceCount: vehicleCount,
    rows: vehicles,
    columns: [
      { label: 'Visit request ID', value: (v) => v.visit_id },
      { label: 'Vehicle type', value: (v) => v.vehicle_type },
      { label: 'Plate number', personal: true, value: (v) => v.plate_number },
      { label: 'Brand', personal: true, value: (v) => v.vehicle_brand },
      {
        label: 'Driver name',
        personal: true,
        value: (v) => v.visit_request_visitor?.visitor_name ?? null,
      },
    ],
  };

  const historySheet: ExportSheet<H> = {
    name: 'Correspondence',
    sourceCount: historyCount,
    rows: history,
    columns: [
      { label: 'ID', value: (h) => h.id },
      { label: 'Inquiry ID', value: (h) => h.inquiry_id },
      { label: 'Visit request ID', value: (h) => h.visit_request_id },
      { label: 'Direction', value: (h) => h.direction },
      { label: 'Type', value: (h) => h.communication_type },
      { label: 'Delivery result', value: (h) => h.delivery_result },
      { label: 'Sent or received', value: (h) => manilaDateTime(h.sent_at) },
      { label: 'Recorded', value: (h) => manilaDateTime(h.created_at) },
      {
        label: 'Recorded by',
        value: (h) =>
          h.user_account?.full_name ??
          (h.direction === 'INBOUND' ? 'Visitor' : null),
      },
      {
        label: 'Recipient email',
        personal: true,
        value: (h) => h.recipient_email,
      },
      { label: 'Subject', personal: true, value: (h) => h.subject },
      { label: 'Message', personal: true, value: (h) => h.message },
    ],
  };

  return [
    specimenSheet,
    lotSheet,
    unitSheet,
    collectionSheet,
    inquirySheet,
    visitSheet,
    preferredSheet,
    visitorSheet,
    vehicleSheet,
    historySheet,
  ] as ExportSheet[];
}
