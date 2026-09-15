import type { TransformFnParams } from 'class-transformer';

export function trimFaqText({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export function normalizeFaqTermList({ value }: TransformFnParams): unknown {
  if (!Array.isArray(value)) return value;

  const seen = new Set<string>();
  return value
    .filter((item: unknown) => {
      if (typeof item !== 'string') return true;
      const normalized = item.trim().replace(/\s+/g, ' ');
      if (!normalized) return true;
      const key = normalized.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((item: unknown) =>
      typeof item === 'string' ? item.trim().replace(/\s+/g, ' ') : item,
    );
}
