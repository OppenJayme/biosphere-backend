import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import type { GenerateReportDto } from './dto/generate-report.dto';
import { ReportBuilderService } from './report-builder.service';
import type { ReportDocument } from './report-document';
import { ReportPeriodType } from './report-period';
import { ReportFormat, ReportType } from './report-types';
import { ReportsService } from './reports.service';

const prismaMock = {
  user_account: { findUnique: jest.fn() },
  audit_log: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
};
const builderMock = { build: jest.fn() };

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const USER: AuthenticatedUser = {
  id: '11111111-1111-4111-8111-111111111111',
  accountId: ACCOUNT_ID,
  email: 'curator@example.com',
  role: 'CURATOR',
};

const DOCUMENT: ReportDocument = {
  title: 'Inventory Report',
  periodLabel: 'September 2026',
  generatedAt: new Date('2026-09-30T00:00:00.000Z'),
  generatedBy: 'Test Curator',
  confidential: true,
  blocks: [],
  csvTable: { columns: ['Accession No.'], rows: [['A-1']] },
  rowCount: 1,
};

function dto(overrides: Partial<GenerateReportDto> = {}): GenerateReportDto {
  return {
    type: ReportType.INVENTORY,
    format: ReportFormat.CSV,
    period: ReportPeriodType.MONTHLY,
    month: '2026-09',
    ...overrides,
  };
}

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    prismaMock.user_account.findUnique.mockResolvedValue({
      full_name: 'Test Curator',
    });
    prismaMock.audit_log.create.mockResolvedValue({});
    builderMock.build.mockResolvedValue(DOCUMENT);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ReportBuilderService, useValue: builderMock },
      ],
    }).compile();
    service = module.get(ReportsService);
  });

  describe('generate', () => {
    it('returns the file and records the generation in the audit log', async () => {
      const report = await service.generate(
        dto({ category: 'Entomology' }),
        USER,
      );

      expect(report.fileName).toBe('biosphere_inventory-report_2026-09.csv');
      expect(report.contentType).toBe('text/csv; charset=utf-8');
      expect(report.body.toString('utf8')).toContain('Accession No.');
      expect(builderMock.build).toHaveBeenCalledWith(
        expect.objectContaining({
          generatedBy: 'Test Curator',
          period: expect.objectContaining({ label: 'September 2026' }),
        }),
      );
      expect(prismaMock.audit_log.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: ACCOUNT_ID,
          action: 'GENERATE_REPORT',
          module: 'reports',
          affected_record_type: 'report',
          status: 'SUCCESS',
          details: expect.objectContaining({
            reportType: 'INVENTORY',
            format: 'CSV',
            filters: { category: 'Entomology' },
            rowCount: 1,
            fileName: 'biosphere_inventory-report_2026-09.csv',
            period: expect.objectContaining({
              type: 'MONTHLY',
              start: '2026-08-31T16:00:00.000Z',
            }),
          }),
        }),
      });
    });

    it('records remarks only as present, never their text', async () => {
      builderMock.build.mockResolvedValue({ ...DOCUMENT, csvTable: undefined });

      await service.generate(
        dto({
          type: ReportType.CONSOLIDATED_OPERATIONS,
          format: ReportFormat.PDF,
          remarks: 'Sensitive note',
        }),
        USER,
      );

      const { details } = prismaMock.audit_log.create.mock.calls[0][0].data;
      expect(details.filters).toEqual({ remarks: true });
      expect(JSON.stringify(details)).not.toContain('Sensitive note');
    });

    it.each([
      [
        'a format the report does not offer',
        { type: ReportType.CONSOLIDATED_OPERATIONS, format: ReportFormat.CSV },
        /not available as CSV/,
      ],
      [
        'an all-time consolidated report',
        {
          type: ReportType.CONSOLIDATED_OPERATIONS,
          format: ReportFormat.PDF,
          period: ReportPeriodType.ALL_TIME,
        },
        /monthly, yearly, or custom/,
      ],
      [
        'filters from another report',
        { inquiryStatus: 'PENDING' as const },
        /does not support these filters: inquiryStatus/,
      ],
      [
        'includeDescendantUnits without a storage unit',
        { includeDescendantUnits: false },
        /only applies together with storageUnitId/,
      ],
      ['a malformed period', { month: '09-2026' }, /YYYY-MM/],
    ])(
      'rejects %s and audits the failure',
      async (_case, overrides, message) => {
        await expect(service.generate(dto(overrides), USER)).rejects.toThrow(
          message,
        );
        await expect(
          service.generate(dto(overrides), USER),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(builderMock.build).not.toHaveBeenCalled();
        expect(prismaMock.audit_log.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            status: 'FAILED',
            details: expect.objectContaining({
              error: expect.stringMatching(message),
            }),
          }),
        });
      },
    );

    it('hides unexpected errors behind a friendly message and produces no file', async () => {
      builderMock.build.mockRejectedValue(new Error('connection reset'));

      const attempt = service.generate(dto(), USER);

      await expect(attempt).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      await expect(attempt).rejects.toThrow(/could not be generated/);
      const { data } = prismaMock.audit_log.create.mock.calls[0][0];
      expect(data.status).toBe('FAILED');
      expect(data.details.error).not.toContain('connection reset');
    });

    it('still surfaces the original error when the failure audit cannot be written', async () => {
      builderMock.build.mockRejectedValue(
        new BadRequestException('Too many rows'),
      );
      prismaMock.audit_log.create.mockRejectedValue(new Error('db down'));

      await expect(service.generate(dto(), USER)).rejects.toThrow(
        'Too many rows',
      );
    });

    it('names custom and all-time files after their period', async () => {
      const custom = await service.generate(
        dto({
          period: ReportPeriodType.CUSTOM,
          month: undefined,
          from: '2026-09-01',
          to: '2026-09-15',
        }),
        USER,
      );
      const allTime = await service.generate(
        dto({ period: ReportPeriodType.ALL_TIME, month: undefined }),
        USER,
      );

      expect(custom.fileName).toBe(
        'biosphere_inventory-report_2026-09-01_to_2026-09-15.csv',
      );
      expect(allTime.fileName).toMatch(
        /^biosphere_inventory-report_all-time_\d{4}-\d{2}-\d{2}\.csv$/,
      );
    });
  });

  describe('listHistory', () => {
    it('maps report audit entries into history items', async () => {
      prismaMock.audit_log.findMany.mockResolvedValue([
        {
          id: 'log-1',
          status: 'SUCCESS',
          created_at: new Date('2026-09-30T01:00:00.000Z'),
          details: {
            reportType: 'INQUIRY_SUMMARY',
            format: 'PDF',
            period: { type: 'MONTHLY', label: 'September 2026' },
            filters: { inquiryStatus: 'PENDING' },
            rowCount: 3,
            fileName: 'x.pdf',
          },
          user_account: { id: ACCOUNT_ID, full_name: 'Test Curator' },
        },
      ]);
      prismaMock.audit_log.count.mockResolvedValue(1);

      const page = await service.listHistory({
        page: 2,
        limit: 10,
        type: ReportType.INQUIRY_SUMMARY,
      });

      expect(prismaMock.audit_log.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            module: 'reports',
            action: 'GENERATE_REPORT',
            details: { path: ['reportType'], equals: 'INQUIRY_SUMMARY' },
          }),
          skip: 10,
          take: 10,
        }),
      );
      expect(page).toEqual({
        items: [
          {
            id: 'log-1',
            type: 'INQUIRY_SUMMARY',
            title: 'General Inquiry Summary',
            format: 'PDF',
            periodLabel: 'September 2026',
            filters: { inquiryStatus: 'PENDING' },
            rowCount: 3,
            fileName: 'x.pdf',
            result: 'SUCCESS',
            error: null,
            generatedBy: { id: ACCOUNT_ID, fullName: 'Test Curator' },
            generatedAt: new Date('2026-09-30T01:00:00.000Z'),
          },
        ],
        total: 1,
        page: 2,
        limit: 10,
      });
    });
  });

  describe('getSummary', () => {
    it('counts successful reports and finds the most generated type', async () => {
      // total, this month, then one count per report type in enum order.
      prismaMock.audit_log.count
        .mockResolvedValueOnce(12)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(0);
      prismaMock.audit_log.findFirst.mockResolvedValue({
        created_at: new Date('2026-09-29T02:00:00.000Z'),
        details: { reportType: 'INVENTORY', format: 'CSV' },
      });

      const summary = await service.getSummary(
        new Date('2026-09-30T20:00:00.000Z'),
      );

      // 20:00 UTC on Sep 30 is already October 1 in Manila.
      expect(prismaMock.audit_log.count).toHaveBeenNthCalledWith(2, {
        where: expect.objectContaining({
          created_at: {
            gte: new Date('2026-09-30T16:00:00.000Z'),
            lt: new Date('2026-10-31T16:00:00.000Z'),
          },
        }),
      });
      expect(summary).toEqual({
        totalGenerated: 12,
        generatedThisMonth: 4,
        mostGenerated: {
          type: 'INVENTORY',
          title: 'Inventory Report',
          count: 7,
        },
        lastGenerated: {
          type: 'INVENTORY',
          title: 'Inventory Report',
          format: 'CSV',
          generatedAt: new Date('2026-09-29T02:00:00.000Z'),
        },
      });
    });

    it('reports nothing generated yet', async () => {
      prismaMock.audit_log.count.mockResolvedValue(0);
      prismaMock.audit_log.findFirst.mockResolvedValue(null);

      await expect(service.getSummary()).resolves.toEqual({
        totalGenerated: 0,
        generatedThisMonth: 0,
        mostGenerated: null,
        lastGenerated: null,
      });
    });
  });
});
