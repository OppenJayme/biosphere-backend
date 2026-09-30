import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportPeriodType } from '../report-period';
import { ReportFormat, ReportType } from '../report-types';

export class ReportDefinitionEntity {
  @ApiProperty({ enum: ReportType })
  type!: ReportType;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ enum: ReportFormat, isArray: true })
  formats!: ReportFormat[];

  @ApiProperty({ enum: ReportPeriodType, isArray: true })
  periods!: ReportPeriodType[];

  @ApiProperty({
    type: [String],
    description: 'GenerateReportDto filter fields this report accepts',
  })
  filters!: string[];

  @ApiProperty()
  periodAppliesTo!: string;
}

export class ReportHistoryActor {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;
}

export class ReportHistoryItem {
  @ApiProperty({ description: 'Audit log entry id' })
  id!: string;

  @ApiProperty({ enum: ReportType, nullable: true })
  type!: ReportType | null;

  @ApiProperty({ nullable: true, type: String })
  title!: string | null;

  @ApiProperty({ enum: ReportFormat, nullable: true })
  format!: ReportFormat | null;

  @ApiProperty({ nullable: true, type: String, example: 'September 2026' })
  periodLabel!: string | null;

  @ApiProperty({ description: 'Filters applied, keyed by request field' })
  filters!: Record<string, unknown>;

  @ApiProperty({ nullable: true, type: Number })
  rowCount!: number | null;

  @ApiProperty({ nullable: true, type: String })
  fileName!: string | null;

  @ApiProperty({ enum: ['SUCCESS', 'FAILED', 'DENIED'] })
  result!: 'SUCCESS' | 'FAILED' | 'DENIED';

  @ApiPropertyOptional({ nullable: true, type: String })
  error!: string | null;

  @ApiProperty({ type: ReportHistoryActor, nullable: true })
  generatedBy!: ReportHistoryActor | null;

  @ApiProperty()
  generatedAt!: Date;
}

export class ReportHistoryPage {
  @ApiProperty({ type: [ReportHistoryItem] })
  items!: ReportHistoryItem[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}

export class ReportTypeCount {
  @ApiProperty({ enum: ReportType })
  type!: ReportType;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  count!: number;
}

export class LastGeneratedReport {
  @ApiProperty({ enum: ReportType })
  type!: ReportType;

  @ApiProperty()
  title!: string;

  @ApiProperty({ enum: ReportFormat })
  format!: ReportFormat;

  @ApiProperty()
  generatedAt!: Date;
}

export class ReportSummary {
  @ApiProperty({ description: 'Successful reports generated, all time' })
  totalGenerated!: number;

  @ApiProperty({
    description:
      'Successful reports generated this calendar month (Philippine time)',
  })
  generatedThisMonth!: number;

  @ApiProperty({ type: ReportTypeCount, nullable: true })
  mostGenerated!: ReportTypeCount | null;

  @ApiProperty({ type: LastGeneratedReport, nullable: true })
  lastGenerated!: LastGeneratedReport | null;
}
