import type { TransformFnParams } from 'class-transformer';

// Trims a free-text search term and drops it when blank, so `?search=`
// behaves like no search at all.
export function optionalSearchTerm({ value }: TransformFnParams): unknown {
  const input: unknown = value;
  if (typeof input !== 'string') return input;
  const trimmed = input.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
