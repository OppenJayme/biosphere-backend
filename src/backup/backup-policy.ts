/**
 * Proposed backup schedule and retention (client proposal §8, pending museum
 * and USC/DCISM confirmation). Times are museum-local (Asia/Manila).
 */
export const BACKUP_TIME_ZONE = 'Asia/Manila';
/** Every four hours, plus the 5 p.m. end-of-day point. */
export const BACKUP_SCHEDULE_HOURS = [0, 4, 8, 12, 16, 17, 20] as const;
export const BACKUP_RETENTION = {
  keepAllHours: 48,
  dailyDays: 14,
  weeklyWeeks: 4,
} as const;
/** Proposed recovery targets; subject to restore testing. */
export const BACKUP_TARGETS = {
  recoveryPointHours: 4,
  recoveryTimeHours: 24,
} as const;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// Asia/Manila has no daylight saving time, so a fixed offset is exact.
const MANILA_OFFSET_MS = 8 * HOUR_MS;

function manilaClock(at: Date): Date {
  return new Date(at.getTime() + MANILA_OFFSET_MS);
}

/** `YYYY-MM-DD` of the museum-local calendar day. */
export function manilaDayKey(at: Date): string {
  return manilaClock(at).toISOString().slice(0, 10);
}

/** Monday-based museum-local week, keyed by that Monday's date. */
export function manilaWeekKey(at: Date): string {
  const local = manilaClock(at);
  const daysSinceMonday = (local.getUTCDay() + 6) % 7;
  return new Date(local.getTime() - daysSinceMonday * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** Next scheduled backup strictly after `now`. */
export function nextScheduledBackup(now: Date): Date {
  const local = manilaClock(now);
  const midnightLocal = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
  );
  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    for (const hour of BACKUP_SCHEDULE_HOURS) {
      const candidate = new Date(
        midnightLocal + dayOffset * DAY_MS + hour * HOUR_MS - MANILA_OFFSET_MS,
      );
      if (candidate.getTime() > now.getTime()) return candidate;
    }
  }
  // Unreachable: the next day always has a slot.
  return new Date(now.getTime() + 4 * HOUR_MS);
}

export interface RetainableBackup {
  id: string;
  startedAt: Date;
}

/**
 * Returns the completed backups whose artifacts fall outside the retention
 * policy: keep every point from the last 48 hours, the newest point of each
 * day for 14 days, and the newest point of each week for four weeks.
 */
export function selectBackupsToPrune<T extends RetainableBackup>(
  backups: T[],
  now: Date,
): T[] {
  const newestFirst = [...backups].sort(
    (left, right) =>
      right.startedAt.getTime() - left.startedAt.getTime() ||
      right.id.localeCompare(left.id),
  );
  const keepAllAfter = now.getTime() - BACKUP_RETENTION.keepAllHours * HOUR_MS;
  const dailyAfter = now.getTime() - BACKUP_RETENTION.dailyDays * DAY_MS;
  const weeklyAfter = now.getTime() - BACKUP_RETENTION.weeklyWeeks * 7 * DAY_MS;
  const keptDays = new Set<string>();
  const keptWeeks = new Set<string>();
  const prune: T[] = [];

  for (const backup of newestFirst) {
    const time = backup.startedAt.getTime();
    const day = manilaDayKey(backup.startedAt);
    const week = manilaWeekKey(backup.startedAt);
    let keep = false;
    if (time >= keepAllAfter) keep = true;
    if (time >= dailyAfter && !keptDays.has(day)) keep = true;
    if (time >= weeklyAfter && !keptWeeks.has(week)) keep = true;

    if (keep) {
      keptDays.add(day);
      keptWeeks.add(week);
    } else {
      prune.push(backup);
    }
  }
  return prune;
}
