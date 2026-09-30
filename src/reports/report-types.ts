import { ReportPeriodType } from './report-period';

// The five approved core report types (SRS §4.7.4).
export enum ReportType {
  CONSOLIDATED_OPERATIONS = 'CONSOLIDATED_OPERATIONS',
  INVENTORY = 'INVENTORY',
  INQUIRY_SUMMARY = 'INQUIRY_SUMMARY',
  VISIT_REQUEST_SUMMARY = 'VISIT_REQUEST_SUMMARY',
  QR_AR_EXHIBITS = 'QR_AR_EXHIBITS',
}

export enum ReportFormat {
  PDF = 'PDF',
  DOCX = 'DOCX',
  CSV = 'CSV',
}

export interface ReportDefinition {
  type: ReportType;
  title: string;
  description: string;
  formats: ReportFormat[];
  periods: ReportPeriodType[];
  /** Filter fields of GenerateReportDto that apply to this report. */
  filters: string[];
  /** What the reporting period selects for this report. */
  periodAppliesTo: string;
}

const ALL_PERIODS = Object.values(ReportPeriodType);
const INVENTORY_FILTERS = [
  'specimenStatus',
  'category',
  'kingdom',
  'phylum',
  'taxonClass',
  'taxonOrder',
  'family',
  'genus',
  'species',
  'conditionClass',
  'storageUnitId',
  'includeDescendantUnits',
  'publicDisplay',
];

export const REPORT_DEFINITIONS: Record<ReportType, ReportDefinition> = {
  [ReportType.CONSOLIDATED_OPERATIONS]: {
    type: ReportType.CONSOLIDATED_OPERATIONS,
    title: 'Consolidated Museum Operations Report',
    description:
      'Inventory summaries and changes, condition and category breakdowns, general inquiries, visit requests, QR and AR exhibits, and curator remarks for the period.',
    // CSV is for detailed tabular data; this report is summary tables only.
    formats: [ReportFormat.DOCX, ReportFormat.PDF],
    periods: [
      ReportPeriodType.MONTHLY,
      ReportPeriodType.YEARLY,
      ReportPeriodType.CUSTOM,
    ],
    filters: ['remarks'],
    periodAppliesTo:
      'Inventory changes, inquiries, visit requests, and exhibit publications during the period; inventory and exhibit totals are as of generation.',
  },
  [ReportType.INVENTORY]: {
    type: ReportType.INVENTORY,
    title: 'Inventory Report',
    description: 'Complete or filtered specimen inventory.',
    formats: [ReportFormat.PDF, ReportFormat.CSV, ReportFormat.DOCX],
    periods: ALL_PERIODS,
    filters: INVENTORY_FILTERS,
    periodAppliesTo: 'Date the specimen was added.',
  },
  [ReportType.INQUIRY_SUMMARY]: {
    type: ReportType.INQUIRY_SUMMARY,
    title: 'General Inquiry Summary',
    description: 'Inquiry counts and details by period and status.',
    formats: [ReportFormat.PDF, ReportFormat.CSV, ReportFormat.DOCX],
    periods: ALL_PERIODS,
    filters: ['inquiryStatus', 'inquiryType'],
    periodAppliesTo: 'Date the inquiry was received.',
  },
  [ReportType.VISIT_REQUEST_SUMMARY]: {
    type: ReportType.VISIT_REQUEST_SUMMARY,
    title: 'Visit-Request Summary',
    description: 'Visit requests by period and status.',
    formats: [ReportFormat.PDF, ReportFormat.CSV, ReportFormat.DOCX],
    periods: ALL_PERIODS,
    filters: ['visitStatus'],
    periodAppliesTo: 'Date the visit request was submitted.',
  },
  [ReportType.QR_AR_EXHIBITS]: {
    type: ReportType.QR_AR_EXHIBITS,
    title: 'QR and AR Exhibit Report',
    description:
      'Published, unpublished, disabled, and AR-enabled exhibit pages.',
    formats: [ReportFormat.PDF, ReportFormat.CSV, ReportFormat.DOCX],
    periods: ALL_PERIODS,
    filters: ['exhibitStatus', 'arEnabled'],
    periodAppliesTo: 'Date the exhibit page was created.',
  },
};
