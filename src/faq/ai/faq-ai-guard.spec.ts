import { FaqAiGuard } from './faq-ai-guard';

describe('FaqAiGuard', () => {
  let now: number;
  const clock = () => now;

  beforeEach(() => {
    now = Date.UTC(2026, 10, 9, 0, 0, 0);
  });

  it('caps calls per client per hour and frees them after an hour', () => {
    const guard = new FaqAiGuard(
      () => ({ perClientPerHour: 2, perDay: 100 }),
      clock,
    );
    expect(guard.tryAcquire('a')).toBe(true);
    expect(guard.tryAcquire('a')).toBe(true);
    expect(guard.tryAcquire('a')).toBe(false);
    expect(guard.tryAcquire('b')).toBe(true);
    now += 60 * 60 * 1000;
    expect(guard.tryAcquire('a')).toBe(true);
  });

  it('caps calls per day across all clients', () => {
    const guard = new FaqAiGuard(
      () => ({ perClientPerHour: 10, perDay: 2 }),
      clock,
    );
    expect(guard.tryAcquire('a')).toBe(true);
    expect(guard.tryAcquire('b')).toBe(true);
    expect(guard.tryAcquire('c')).toBe(false);
    now += 24 * 60 * 60 * 1000;
    expect(guard.tryAcquire('c')).toBe(true);
  });

  it('backs off after a rate limit and doubles on repeated failures', () => {
    const guard = new FaqAiGuard(
      () => ({ perClientPerHour: 100, perDay: 100 }),
      clock,
    );
    guard.recordFailure('rate_limited');
    expect(guard.tryAcquire('a')).toBe(false);
    now += 60_000;
    expect(guard.tryAcquire('a')).toBe(true);
    guard.recordFailure('unavailable');
    now += 60_000;
    // Second consecutive failure: 120 s cooldown, so 60 s is not enough.
    expect(guard.tryAcquire('a')).toBe(false);
    now += 60_000;
    expect(guard.tryAcquire('a')).toBe(true);
    guard.recordSuccess();
    guard.recordFailure('timeout');
    now += 60_000;
    expect(guard.tryAcquire('a')).toBe(true);
  });

  it('honours a longer Retry-After and ignores non-transient failures', () => {
    const guard = new FaqAiGuard(
      () => ({ perClientPerHour: 100, perDay: 100 }),
      clock,
    );
    guard.recordFailure('invalid_response');
    expect(guard.tryAcquire('a')).toBe(true);
    guard.recordFailure('rate_limited', 5 * 60_000);
    now += 4 * 60_000;
    expect(guard.tryAcquire('a')).toBe(false);
    now += 60_000;
    expect(guard.tryAcquire('a')).toBe(true);
  });

  it('allows nothing when a limit is zero', () => {
    const guard = new FaqAiGuard(
      () => ({ perClientPerHour: 0, perDay: 100 }),
      clock,
    );
    expect(guard.tryAcquire('a')).toBe(false);
  });
});
