import type { Request } from 'express';

/** Request path without the query string, which may carry personal data. */
export function requestPath(req: Pick<Request, 'originalUrl' | 'url'>): string {
  const url = req.originalUrl ?? req.url ?? '';
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}
