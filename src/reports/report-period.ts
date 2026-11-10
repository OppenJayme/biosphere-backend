import { BadRequestException } from '@nestjs/common';

export enum ReportPeriodType {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
  CUSTOM = 'CUSTOM',
  ALL_TIME = 'ALL_TIME',
}

export interface ReportPeriodInput {
  period: ReportPeriodType;
  month?: string;
  year?: number;
  from?: string;
  to?: string;
}

export interface ResolvedReportPeriod {
  type: ReportPeriodType;
  /** Inclusive start; undefined for ALL_TIME. */
  start?: Date;
  /** Exclusive end; undefined for ALL_TIME. */
  end?: Date;
  label: string;
}

// Reporting periods follow the museum's calendar (Philippine time, UTC+8,
// no daylight saving), so "September 2026" means Manila midnight to midnight.
export const REPORT_UTC_OFFSET_HOURS = 8;
export const REPORT_TIMEZONE = 'Asia/Manila';

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_CUSTOM_RANGE_DAYS = 3660;

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const DATE_LABEL = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});

export function resolveReportPeriod(
  input: ReportPeriodInput,
): ResolvedReportPeriod {
  switch (input.period) {
    case ReportPeriodType.MONTHLY: {
      const match = input.month ? MONTH_PATTERN.exec(input.month) : null;
      if (!match) {
        throw new BadRequestException(
          'A monthly report needs a month in YYYY-MM format, for example 2026-09.',
        );
      }
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      return {
        type: input.period,
        start: localMidnight(year, month, 1),
        end: localMidnight(year, month + 1, 1),
        label: MONTH_LABEL.format(new Date(Date.UTC(year, month, 1))),
      };
    }
    case ReportPeriodType.YEARLY: {
      const year = input.year;
      if (!year || !Number.isInteger(year) || year < 1900 || year > 9999) {
        throw new BadRequestException(
          'A yearly report needs a four-digit year, for example 2026.',
        );
      }
      return {
        type: input.period,
        start: localMidnight(year, 0, 1),
        end: localMidnight(year + 1, 0, 1),
        label: String(year),
      };
    }
    case ReportPeriodType.CUSTOM: {
      const from = parseDate(input.from, 'start');
      const to = parseDate(input.to, 'end');
      if (from.getTime() > to.getTime()) {
        throw new BadRequestException(
          'The report start date must be on or before the end date.',
        );
      }
      const days = (to.getTime() - from.getTime()) / 86_400_000 + 1;
      if (days > MAX_CUSTOM_RANGE_DAYS) {
        throw new BadRequestException(
          'A custom report period can cover at most 10 years.',
        );
      }
      const start = localMidnight(
        from.getUTCFullYear(),
        from.getUTCMonth(),
        from.getUTCDate(),
      );
      const end = localMidnight(
        to.getUTCFullYear(),
        to.getUTCMonth(),
        to.getUTCDate() + 1,
      );
      return {
        type: input.period,
        start,
        end,
        label: `${DATE_LABEL.format(from)} – ${DATE_LABEL.format(to)}`,
      };
    }
    case ReportPeriodType.ALL_TIME:
      return { type: input.period, label: 'All records' };
  }
}

/** Prisma date-range filter for a resolved period, or undefined for ALL_TIME. */
export function periodFilter(
  period: ResolvedReportPeriod,
): { gte: Date; lt: Date } | undefined {
  return period.start && period.end
    ? { gte: period.start, lt: period.end }
    : undefined;
}

function localMidnight(year: number, monthIndex: number, day: number): Date {
  return new Date(
    Date.UTC(year, monthIndex, day) - REPORT_UTC_OFFSET_HOURS * 3_600_000,
  );
}

function parseDate(value: string | undefined, bound: 'start' | 'end'): Date {
  const match = value ? DATE_PATTERN.exec(value) : null;
  const date = match
    ? new Date(
        Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
      )
    : null;
  // Rejects impossible dates such as 2026-02-30, which Date.UTC rolls over.
  if (!date || date.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException(
      `A custom report needs a valid ${bound} date in YYYY-MM-DD format.`,
    );
  }
  return date;
}
