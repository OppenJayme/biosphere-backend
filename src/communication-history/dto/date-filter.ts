import { BadRequestException } from '@nestjs/common';

// YYYY-MM-DD with a valid month and day; calendar validity (e.g. Feb 30) is
// checked in parseDateOnly.
export const DATE_ONLY_PATTERN =
  /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// The museum runs on Philippine time (UTC+8, no daylight saving), so a
// submission date filter covers the museum's calendar day.
const MUSEUM_UTC_OFFSET = '+08:00';
const DAY_MS = 24 * 60 * 60 * 1000;

// Midnight UTC for the given date, matching how @db.Date columns round-trip.
export function parseDateOnly(value: string, field: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new BadRequestException(`${field} is not a real date.`);
  }
  return date;
}

function assertOrdered(
  from: string | undefined,
  to: string | undefined,
  fields: [string, string],
): void {
  if (from && to && from > to) {
    throw new BadRequestException(
      `${fields[0]} must be on or before ${fields[1]}.`,
    );
  }
}

// created_at range for "submitted between these museum dates", both ends
// inclusive. Returns undefined when neither end is set.
export function submittedAtRange(
  from: string | undefined,
  to: string | undefined,
): { gte?: Date; lt?: Date } | undefined {
  if (!from && !to) return undefined;
  assertOrdered(from, to, ['submittedFrom', 'submittedTo']);
  const start = (value: string, field: string) => {
    parseDateOnly(value, field);
    return new Date(`${value}T00:00:00.000${MUSEUM_UTC_OFFSET}`);
  };
  return {
    ...(from && { gte: start(from, 'submittedFrom') }),
    ...(to && { lt: new Date(start(to, 'submittedTo').getTime() + DAY_MS) }),
  };
}

// Inclusive range over a @db.Date column. Returns undefined when neither end
// is set.
export function calendarDateRange(
  from: string | undefined,
  to: string | undefined,
  fields: [string, string],
): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  assertOrdered(from, to, fields);
  return {
    ...(from && { gte: parseDateOnly(from, fields[0]) }),
    ...(to && { lte: parseDateOnly(to, fields[1]) }),
  };
}
