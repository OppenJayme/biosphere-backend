import type { TransformFnParams } from 'class-transformer';
import { Prisma } from '../generated/prisma/client';

/**
 * The museum's standard condition list (the same options the curator form
 * offers). A value that matches one of these, ignoring case, is saved with
 * this exact spelling so every lot reads the same way.
 */
export const STANDARD_CONDITION_CLASSES = [
  'Excellent',
  'Good',
  'Fair',
  'Poor',
  'Critical',
] as const;

const STANDARD_BY_KEY = new Map<string, string>(
  STANDARD_CONDITION_CLASSES.map((condition) => [
    condition.toLowerCase(),
    condition,
  ]),
);

/**
 * Condition classes are curator-entered text. Leading/trailing whitespace is
 * removed and internal runs of whitespace collapse to one space so that
 * "Fair  - cracked" and "Fair - cracked" are the same value. A standard
 * condition typed in any case ("good", "GOOD") is saved as its listed
 * spelling ("Good"); other values keep the curator's spelling.
 */
export function normalizeConditionClass({ value }: TransformFnParams): unknown {
  const input: unknown = value;
  if (typeof input !== 'string') return input;
  const collapsed = input.trim().replace(/\s+/g, ' ');
  return STANDARD_BY_KEY.get(collapsed.toLowerCase()) ?? collapsed;
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
