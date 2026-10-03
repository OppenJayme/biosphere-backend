export const RATE_LIMIT_WINDOW_MS = 60_000;

export const GLOBAL_RATE_LIMIT = {
  ttl: RATE_LIMIT_WINDOW_MS,
  limit: 300,
} as const;

export const LOGIN_RATE_LIMIT = {
  ttl: RATE_LIMIT_WINDOW_MS,
  limit: 5,
} as const;

export const PUBLIC_FORM_RATE_LIMIT = {
  ttl: RATE_LIMIT_WINDOW_MS,
  limit: 10,
} as const;

// Report generation runs many aggregate queries and renders a file, so a
// curator gets a tighter ceiling than ordinary reads.
export const REPORT_GENERATION_RATE_LIMIT = {
  ttl: RATE_LIMIT_WINDOW_MS,
  limit: 20,
} as const;
