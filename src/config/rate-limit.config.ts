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
