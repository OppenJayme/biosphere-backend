import { AiProviderErrorKind } from './ai-provider';

export interface FaqAiGuardLimits {
  perClientPerHour: number;
  perDay: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_TRACKED_CLIENTS = 5000;
const BASE_COOLDOWN_MS = 60_000;
const MAX_COOLDOWN_MS = 15 * 60_000;

/**
 * In-memory guardrails for the optional AI layer: a per-client hourly cap,
 * a process-wide daily cap and an exponential cooldown after rate limits or
 * outages, so a quota problem never becomes a retry storm. State resets when
 * the server restarts and is per process; it is a cost guard, not security.
 */
export class FaqAiGuard {
  private readonly clients = new Map<string, number[]>();
  private dayStart = 0;
  private dayCount = 0;
  private cooldownUntil = 0;
  private consecutiveFailures = 0;

  constructor(
    private readonly limits: () => FaqAiGuardLimits,
    private readonly now: () => number = Date.now,
  ) {}

  /** Reserves one AI call for this client, or returns false without one. */
  tryAcquire(clientKey: string): boolean {
    const now = this.now();
    if (now < this.cooldownUntil) return false;
    const { perClientPerHour, perDay } = this.limits();
    if (perClientPerHour <= 0 || perDay <= 0) return false;

    if (now - this.dayStart >= DAY_MS) {
      this.dayStart = now;
      this.dayCount = 0;
    }
    if (this.dayCount >= perDay) return false;

    const recent = (this.clients.get(clientKey) ?? []).filter(
      (at) => now - at < HOUR_MS,
    );
    if (recent.length >= perClientPerHour) {
      this.clients.set(clientKey, recent);
      return false;
    }
    recent.push(now);
    this.clients.delete(clientKey);
    this.clients.set(clientKey, recent);
    this.dayCount += 1;
    this.prune(now);
    return true;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
  }

  recordFailure(kind: AiProviderErrorKind, retryAfterMs?: number): void {
    if (kind !== 'rate_limited' && kind !== 'unavailable' && kind !== 'timeout')
      return;
    this.consecutiveFailures += 1;
    const backoff = Math.min(
      MAX_COOLDOWN_MS,
      BASE_COOLDOWN_MS * 2 ** (this.consecutiveFailures - 1),
    );
    this.cooldownUntil =
      this.now() +
      Math.max(backoff, Math.min(retryAfterMs ?? 0, MAX_COOLDOWN_MS));
  }

  private prune(now: number): void {
    if (this.clients.size <= MAX_TRACKED_CLIENTS) return;
    for (const [key, times] of this.clients) {
      if (times.every((at) => now - at >= HOUR_MS)) this.clients.delete(key);
      if (this.clients.size <= MAX_TRACKED_CLIENTS) return;
    }
    // Still over the cap: drop the oldest-inserted clients first.
    for (const key of this.clients.keys()) {
      this.clients.delete(key);
      if (this.clients.size <= MAX_TRACKED_CLIENTS) return;
    }
  }
}
