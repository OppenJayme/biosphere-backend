import {
  BadRequestException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import {
  type GenerateReportDto,
  REPORT_FILTER_FIELDS,
} from './dto/generate-report.dto';
import type { ListReportHistoryQueryDto } from './dto/list-report-history-query.dto';
import {
  ReportDefinitionEntity,
  ReportHistoryItem,
  ReportHistoryPage,
  ReportSummary,
} from './entities/report.entity';
import { ReportBuilderService } from './report-builder.service';
import type { ReportDocument } from './report-document';
import {
  REPORT_UTC_OFFSET_HOURS,
  ReportPeriodType,
  resolveReportPeriod,
  type ResolvedReportPeriod,
} from './report-period';
import { REPORT_DEFINITIONS, ReportFormat, ReportType } from './report-types';
import { renderCsv } from './renderers/csv.renderer';
import { renderDocx } from './renderers/docx.renderer';
import { renderPdf } from './renderers/pdf.renderer';

export const REPORT_AUDIT_MODULE = 'reports';
export const REPORT_AUDIT_ACTION = 'GENERATE_REPORT';

export interface GeneratedReport {
  fileName: string;
  contentType: string;
  body: Buffer;
}

const CONTENT_TYPES: Record<ReportFormat, string> = {
  [ReportFormat.PDF]: 'application/pdf',
  [ReportFormat.DOCX]:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  [ReportFormat.CSV]: 'text/csv; charset=utf-8',
};

type ReportAuditDetails = {
  reportType?: string;
  format?: string;
  period?: { type?: string; label?: string };
  filters?: Record<string, unknown>;
  rowCount?: number;
  fileName?: string;
  error?: string;
};

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly builder: ReportBuilderService,
  ) {}

  listDefinitions(): ReportDefinitionEntity[] {
    return Object.values(REPORT_DEFINITIONS).map((definition) => ({
      ...definition,
    }));
  }

  /**
   * Generates the report file and records the attempt in the audit log
   * (REQ-4.7-14), including failures, which are never returned as a file.
   */
  async generate(
    dto: GenerateReportDto,
    user: AuthenticatedUser,
  ): Promise<GeneratedReport> {
    const filters = appliedFilters(dto);
    let period: ResolvedReportPeriod | undefined;
    try {
      this.validateRequest(dto);
      period = resolveReportPeriod(dto);
      const generatedAt = new Date();
      const actor = await this.prisma.user_account.findUnique({
        where: { id: user.accountId },
        select: { full_name: true },
      });
      const document = await this.builder.build({
        dto,
        period,
        generatedAt,
        generatedBy: actor?.full_name ?? user.email ?? 'Curator',
      });
      const body = await render(document, dto.format);
      const fileName = reportFileName(dto, period, generatedAt);

      await this.recordAudit(user.accountId, 'SUCCESS', {
        reportType: dto.type,
        format: dto.format,
        period: periodDetails(period),
        filters,
        rowCount: document.rowCount,
        fileName,
      });
      return { fileName, contentType: CONTENT_TYPES[dto.format], body };
    } catch (error) {
      const failure =
        error instanceof HttpException
          ? error
          : new InternalServerErrorException(
              'The report could not be generated. No file was produced; please try again.',
            );
      if (!(error instanceof HttpException)) {
        this.logger.error(
          `Report generation failed for ${dto.type}/${dto.format}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
      await this.recordAudit(user.accountId, 'FAILED', {
        reportType: dto.type,
        format: dto.format,
        period: period ? periodDetails(period) : { type: dto.period },
        filters,
        error: failureMessage(failure),
      }).catch((auditError: unknown) =>
        this.logger.error(
          'Could not record the failed report in the audit log',
          auditError instanceof Error ? auditError.stack : String(auditError),
        ),
      );
      throw failure;
    }
  }

  async listHistory(
    query: ListReportHistoryQueryDto,
  ): Promise<ReportHistoryPage> {
    const where: Prisma.audit_logWhereInput = {
      module: REPORT_AUDIT_MODULE,
      action: REPORT_AUDIT_ACTION,
      status: query.result,
      details: query.type
        ? { path: ['reportType'], equals: query.type }
        : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.audit_log.findMany({
        where,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: { user_account: { select: { id: true, full_name: true } } },
      }),
      this.prisma.audit_log.count({ where }),
    ]);

    return {
      items: items.map((item): ReportHistoryItem => {
        const details = (item.details ?? {}) as ReportAuditDetails;
        const type = isReportType(details.reportType)
          ? details.reportType
          : null;
        return {
          id: item.id,
          type,
          title: type ? REPORT_DEFINITIONS[type].title : null,
          format: isReportFormat(details.format) ? details.format : null,
          periodLabel: details.period?.label ?? null,
          filters: details.filters ?? {},
          rowCount: details.rowCount ?? null,
          fileName: details.fileName ?? null,
          result: item.status,
          error: details.error ?? null,
          generatedBy: item.user_account
            ? {
                id: item.user_account.id,
                fullName: item.user_account.full_name,
              }
            : null,
          generatedAt: item.created_at,
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async getSummary(now = new Date()): Promise<ReportSummary> {
    const successful: Prisma.audit_logWhereInput = {
      module: REPORT_AUDIT_MODULE,
      action: REPORT_AUDIT_ACTION,
      status: 'SUCCESS',
    };
    const thisMonth = resolveReportPeriod({
      period: ReportPeriodType.MONTHLY,
      month: manilaMonth(now),
    });
    const types = Object.values(ReportType);

    const [totalGenerated, generatedThisMonth, last, ...perType] =
      await Promise.all([
        this.prisma.audit_log.count({ where: successful }),
        this.prisma.audit_log.count({
          where: {
            ...successful,
            created_at: { gte: thisMonth.start, lt: thisMonth.end },
          },
        }),
        this.prisma.audit_log.findFirst({
          where: successful,
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        }),
        ...types.map((type) =>
          this.prisma.audit_log.count({
            where: {
              ...successful,
              details: { path: ['reportType'], equals: type },
            },
          }),
        ),
      ]);

    let mostGenerated: ReportSummary['mostGenerated'] = null;
    types.forEach((type, index) => {
      const count = perType[index];
      if (count > 0 && (!mostGenerated || count > mostGenerated.count)) {
        mostGenerated = { type, title: REPORT_DEFINITIONS[type].title, count };
      }
    });

    const lastDetails = (last?.details ?? {}) as ReportAuditDetails;
    const lastGenerated =
      last &&
      isReportType(lastDetails.reportType) &&
      isReportFormat(lastDetails.format)
        ? {
            type: lastDetails.reportType,
            title: REPORT_DEFINITIONS[lastDetails.reportType].title,
            format: lastDetails.format,
            generatedAt: last.created_at,
          }
        : null;

    return { totalGenerated, generatedThisMonth, mostGenerated, lastGenerated };
  }

  // REQ-4.7-15: reject combinations the report cannot honor instead of
  // silently ignoring them.
  private validateRequest(dto: GenerateReportDto): void {
    const definition = REPORT_DEFINITIONS[dto.type];
    if (!definition.formats.includes(dto.format)) {
      throw new BadRequestException(
        `The ${definition.title} is not available as ${dto.format}. ` +
          `Choose ${definition.formats.join(' or ')}.`,
      );
    }
    if (!definition.periods.includes(dto.period)) {
      throw new BadRequestException(
        `The ${definition.title} needs a monthly, yearly, or custom period.`,
      );
    }
    const unsupported = REPORT_FILTER_FIELDS.filter(
      (field) =>
        dto[field] !== undefined && !definition.filters.includes(field),
    );
    if (unsupported.length > 0) {
      throw new BadRequestException(
        `The ${definition.title} does not support these filters: ${unsupported.join(', ')}.`,
      );
    }
    if (dto.includeDescendantUnits !== undefined && !dto.storageUnitId) {
      throw new BadRequestException(
        'includeDescendantUnits only applies together with storageUnitId.',
      );
    }
  }

  private async recordAudit(
    userId: string,
    status: 'SUCCESS' | 'FAILED',
    details: ReportAuditDetails,
  ): Promise<void> {
    await this.prisma.audit_log.create({
      data: {
        user_id: userId,
        affected_record_type: 'report',
        action: REPORT_AUDIT_ACTION,
        module: REPORT_AUDIT_MODULE,
        details: details as Prisma.InputJsonObject,
        status,
      },
    });
  }
}

function render(
  document: ReportDocument,
  format: ReportFormat,
): Promise<Buffer> {
  switch (format) {
    case ReportFormat.PDF:
      return renderPdf(document);
    case ReportFormat.DOCX:
      return renderDocx(document);
    case ReportFormat.CSV:
      if (!document.csvTable) {
        throw new BadRequestException(
          `The ${document.title} has no CSV export.`,
        );
      }
      return Promise.resolve(renderCsv(document.csvTable));
  }
}

/**
 * Filters recorded in the audit log. Remarks are free text that may be long
 * or sensitive, so only their presence is recorded.
 */
function appliedFilters(dto: GenerateReportDto): Record<string, unknown> {
  const filters: Record<string, unknown> = {};
  for (const field of REPORT_FILTER_FIELDS) {
    if (dto[field] === undefined) continue;
    filters[field] = field === 'remarks' ? true : dto[field];
  }
  return filters;
}

function periodDetails(period: ResolvedReportPeriod) {
  return {
    type: period.type,
    label: period.label,
    start: period.start?.toISOString() ?? null,
    end: period.end?.toISOString() ?? null,
  };
}

function failureMessage(error: HttpException): string {
  const response = error.getResponse();
  if (typeof response === 'string') return response;
  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) return message.join('; ');
  return typeof message === 'string' ? message : error.message;
}

const FILE_SLUGS: Record<ReportType, string> = {
  [ReportType.CONSOLIDATED_OPERATIONS]: 'consolidated-operations-report',
  [ReportType.INVENTORY]: 'inventory-report',
  [ReportType.INQUIRY_SUMMARY]: 'inquiry-summary',
  [ReportType.VISIT_REQUEST_SUMMARY]: 'visit-request-summary',
  [ReportType.QR_AR_EXHIBITS]: 'qr-ar-exhibit-report',
};

function reportFileName(
  dto: GenerateReportDto,
  period: ResolvedReportPeriod,
  generatedAt: Date,
): string {
  const periodSlug =
    period.type === ReportPeriodType.MONTHLY
      ? dto.month
      : period.type === ReportPeriodType.YEARLY
        ? String(dto.year)
        : period.type === ReportPeriodType.CUSTOM
          ? `${dto.from}_to_${dto.to}`
          : `all-time_${manilaDate(generatedAt)}`;
  return `biosphere_${FILE_SLUGS[dto.type]}_${periodSlug}.${dto.format.toLowerCase()}`;
}

function manilaDate(date: Date): string {
  return new Date(date.getTime() + REPORT_UTC_OFFSET_HOURS * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

function manilaMonth(date: Date): string {
  return manilaDate(date).slice(0, 7);
}

function isReportType(value: unknown): value is ReportType {
  return Object.values(ReportType).includes(value as ReportType);
}

function isReportFormat(value: unknown): value is ReportFormat {
  return Object.values(ReportFormat).includes(value as ReportFormat);
}
