import type { TransformFnParams } from 'class-transformer';
import { Prisma } from '../generated/prisma/client';

/**
 * Condition classes are curator-entered text. Leading/trailing whitespace is
 * removed and internal runs of whitespace collapse to one space so that
 * "Fair  - cracked" and "Fair - cracked" are the same value.
 */
export function normalizeConditionClass({ value }: TransformFnParams): unknown {
  const input: unknown = value;
  return typeof input === 'string' ? input.trim().replace(/\s+/g, ' ') : input;
}

/**
 * Lots are matched on condition case-insensitively (REQ-4.5-07), so "Good"
 * and "good" merge into one lot instead of creating a duplicate.
 */
export function conditionClassEquals(
  conditionClass: string,
): Prisma.StringFilter<'specimen_lot'> {
  return { equals: conditionClass, mode: Prisma.QueryMode.insensitive };
}

export function isSameConditionClass(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: 'accent' }) === 0;
}
