import { performance } from 'node:perf_hooks';
import { setTimeout as pause } from 'node:timers/promises';
import request from 'supertest';
import type { App } from 'supertest/types';

/** Poll only authorized GET readback; never replay the denied request or bypass guards. */
export async function expectAuditReadback(
  server: App,
  expected: Record<string, unknown>,
  {
    timeoutMs = 2000,
    token = 'curator-fixture',
    query = { action: 'ACCESS_DENIED', result: 'DENIED' },
  }: {
    timeoutMs?: number;
    token?: string;
    query?: Record<string, string>;
  } = {},
): Promise<void> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error('Audit readback timeout must be finite and positive.');
  }
  const deadline = performance.now() + timeoutMs;
  let lastMismatch: unknown;
  while (performance.now() < deadline) {
    const remaining = Math.max(1, Math.ceil(deadline - performance.now()));
    // 401/403/500 and early transport failures are NOT eventual consistency.
    // Only expiration of this helper's own remaining deadline is normalized.
    const response = await request(server)
      .get('/audit-logs')
      .query(query)
      .auth(token, { type: 'bearer' })
      .timeout({ response: remaining, deadline: remaining })
      .expect(200)
      .catch((error: unknown) => {
        if (
          lastMismatch &&
          performance.now() >= deadline &&
          error instanceof Error &&
          'code' in error &&
          error.code === 'ECONNABORTED' &&
          'timeout' in error &&
          error.timeout === remaining
        )
          return null;
        throw error;
      });
    if (!response) break;
    try {
      expect(response.body).toMatchObject(expected);
      return;
    } catch (error) {
      if (!(error instanceof Error) || !('matcherResult' in error)) throw error;
      lastMismatch = error;
    }
    const wait = Math.min(25, Math.max(0, deadline - performance.now()));
    if (wait > 0) await pause(wait);
  }
  throw new Error(`Audit readback did not match within ${timeoutMs}ms.`, {
    cause: lastMismatch,
  });
}
