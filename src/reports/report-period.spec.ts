import { BadRequestException } from '@nestjs/common';
import {
  periodFilter,
  ReportPeriodType,
  resolveReportPeriod,
} from './report-period';

describe('resolveReportPeriod', () => {
  it('resolves a month to Philippine-time midnight boundaries', () => {
    const period = resolveReportPeriod({
      period: ReportPeriodType.MONTHLY,
      month: '2026-09',
    });

    expect(period.start?.toISOString()).toBe('2026-08-31T16:00:00.000Z');
    expect(period.end?.toISOString()).toBe('2026-09-30T16:00:00.000Z');
    expect(period.label).toBe('September 2026');
  });

  it('rolls December over into the next year', () => {
    const period = resolveReportPeriod({
      period: ReportPeriodType.MONTHLY,
      month: '2026-12',
    });

    expect(period.end?.toISOString()).toBe('2026-12-31T16:00:00.000Z');
  });

  it('resolves a year', () => {
    const period = resolveReportPeriod({
      period: ReportPeriodType.YEARLY,
      year: 2026,
    });

    expect(period.start?.toISOString()).toBe('2025-12-31T16:00:00.000Z');
    expect(period.end?.toISOString()).toBe('2026-12-31T16:00:00.000Z');
    expect(period.label).toBe('2026');
  });

  it('includes the whole end day of a custom range', () => {
    const period = resolveReportPeriod({
      period: ReportPeriodType.CUSTOM,
      from: '2026-09-01',
      to: '2026-09-15',
    });

    expect(period.start?.toISOString()).toBe('2026-08-31T16:00:00.000Z');
    expect(period.end?.toISOString()).toBe('2026-09-15T16:00:00.000Z');
    expect(period.label).toBe('Sep 1, 2026 – Sep 15, 2026');
  });

  it('has no bounds for all-time reports', () => {
    const period = resolveReportPeriod({ period: ReportPeriodType.ALL_TIME });

    expect(periodFilter(period)).toBeUndefined();
    expect(period.label).toBe('All records');
  });

  it.each([
    [{ period: ReportPeriodType.MONTHLY }, /YYYY-MM/],
    [{ period: ReportPeriodType.MONTHLY, month: '2026-13' }, /YYYY-MM/],
    [{ period: ReportPeriodType.YEARLY }, /four-digit year/],
    [{ period: ReportPeriodType.CUSTOM, to: '2026-09-01' }, /start date/],
    [
      { period: ReportPeriodType.CUSTOM, from: '2026-02-30', to: '2026-03-01' },
      /start date/,
    ],
    [
      { period: ReportPeriodType.CUSTOM, from: '2026-09-02', to: '2026-09-01' },
      /on or before/,
    ],
    [
      { period: ReportPeriodType.CUSTOM, from: '2000-01-01', to: '2026-01-01' },
      /at most 10 years/,
    ],
  ])('rejects %j with an understandable message', (input, message) => {
    expect(() => resolveReportPeriod(input)).toThrow(BadRequestException);
    expect(() => resolveReportPeriod(input)).toThrow(message);
  });
});
