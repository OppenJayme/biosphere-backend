import { ApiProperty } from '@nestjs/swagger';

export class SpecimenStatusCounts {
  @ApiProperty()
  UNCATALOGED!: number;

  @ApiProperty()
  CATALOGED!: number;

  @ApiProperty()
  ARCHIVED!: number;
}

export class CategoryCount {
  @ApiProperty({ example: 'Insect', description: '"Uncategorized" when blank' })
  category!: string;

  @ApiProperty()
  count!: number;
}

export class MonthCount {
  @ApiProperty({ example: '2026-09', description: 'Month in Philippine time' })
  month!: string;

  @ApiProperty()
  count!: number;
}

export class DashboardSpecimenSummary {
  @ApiProperty({ description: 'All specimen records, archived included' })
  total!: number;

  @ApiProperty({ type: SpecimenStatusCounts })
  byStatus!: SpecimenStatusCounts;

  @ApiProperty({
    description: 'Records added this calendar month (Philippine time)',
  })
  addedThisMonth!: number;

  @ApiProperty({
    description:
      'Active (non-archived) records sharing a scientific name and category with another active record, ignoring case. A prompt for review, not the catalog duplicate check.',
  })
  possibleDuplicates!: number;

  @ApiProperty({
    type: [CategoryCount],
    description:
      'Active records by specimen category, largest first; categories differing only in case are merged',
  })
  byCategory!: CategoryCount[];

  @ApiProperty({
    type: [MonthCount],
    description: 'Records added per month for the last 12 months, oldest first',
  })
  addedByMonth!: MonthCount[];
}

export class DashboardSubmissionSummary {
  @ApiProperty({ description: 'General inquiries with status PENDING' })
  pendingInquiries!: number;

  @ApiProperty({ description: 'Visit requests with status PENDING' })
  pendingVisitRequests!: number;
}

export class PendingExhibit {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  publicSlug!: string;
}

export class DashboardExhibitSummary {
  @ApiProperty({ description: 'Exhibit pages that are not archived' })
  total!: number;

  @ApiProperty({
    description:
      'Published pages whose specimen is Cataloged and approved for public display, so the QR link resolves',
  })
  live!: number;

  @ApiProperty({
    description:
      'Published pages whose specimen is no longer eligible, so the QR link does not resolve',
  })
  publishedUnavailable!: number;

  @ApiProperty()
  unpublished!: number;

  @ApiProperty()
  disabled!: number;

  @ApiProperty({
    type: [PendingExhibit],
    description: 'Most recently updated unpublished pages (up to 3)',
  })
  pending!: PendingExhibit[];
}

export class DashboardSpecimenRow {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true, type: String })
  accessionNumber!: string | null;

  @ApiProperty({ nullable: true, type: String })
  scientificName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  commonName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  specimenCategory!: string | null;

  @ApiProperty({ enum: ['UNCATALOGED', 'CATALOGED', 'ARCHIVED'] })
  status!: 'UNCATALOGED' | 'CATALOGED' | 'ARCHIVED';

  @ApiProperty()
  publicDisplay!: boolean;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Room-to-unit path of the largest active lot',
  })
  storageLocation!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Condition of the largest active lot',
  })
  condition!: string | null;

  @ApiProperty()
  updatedAt!: Date;
}

export class DashboardSummary {
  @ApiProperty()
  generatedAt!: Date;

  @ApiProperty({ type: DashboardSpecimenSummary })
  specimens!: DashboardSpecimenSummary;

  @ApiProperty({ type: DashboardSubmissionSummary })
  submissions!: DashboardSubmissionSummary;

  @ApiProperty({ type: DashboardExhibitSummary })
  exhibits!: DashboardExhibitSummary;

  @ApiProperty({
    type: [DashboardSpecimenRow],
    description: 'Most recently updated Uncataloged records (up to 5)',
  })
  catalogingQueue!: DashboardSpecimenRow[];

  @ApiProperty({
    type: [DashboardSpecimenRow],
    description: 'Most recently updated records of any status (up to 7)',
  })
  recentSpecimens!: DashboardSpecimenRow[];
}
