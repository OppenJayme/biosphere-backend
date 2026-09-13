import type { TransformFnParams } from 'class-transformer';

export const TAG_NAME_PATTERN = /^[\p{L}\p{M}\p{N}\p{P}\p{S} ]+$/u;

export function normalizeTagName({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
}
