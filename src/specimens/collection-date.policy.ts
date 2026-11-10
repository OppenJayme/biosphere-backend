/** Shared provenance rule for DTOs, persistence, imports and catalog readiness. */
import { BadRequestException } from '@nestjs/common';
import { ValidateBy } from 'class-validator';

/** Uses the museum's calendar, regardless of the database/server timezone. */
export function museumToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: string) =>
    parts.find((part) => part.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function isValidCollectionDate(
  value: unknown,
  now = new Date(),
): boolean {
  const dateOnly =
    value instanceof Date
      ? Number.isNaN(value.getTime())
        ? ''
        : value.toISOString().slice(0, 10)
      : value;
  if (typeof dateOnly !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateOnly))
    return false;
  const parsed = new Date(`${dateOnly}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === dateOnly &&
    dateOnly <= museumToday(now)
  );
}

export function IsValidCollectionDate(): PropertyDecorator {
  return ValidateBy({
    name: 'isValidCollectionDate',
    validator: {
      validate: (value: unknown) => isValidCollectionDate(value),
      defaultMessage: () =>
        'collectionDate must be a valid YYYY-MM-DD date on or before today (Asia/Manila)',
    },
  });
}

/** Services also validate so trusted internal calls cannot bypass the DTO. */
export function assertCollectionDate(value: string | null | undefined): void {
  if (value != null && !isValidCollectionDate(value)) {
    throw new BadRequestException(
      'Collection date must be a valid date on or before today (Asia/Manila).',
    );
  }
}
