import {
  manilaDayKey,
  manilaWeekKey,
  nextScheduledBackup,
  selectBackupsToPrune,
} from './backup-policy';

const HOUR = 60 * 60 * 1000;

describe('backup policy', () => {
  describe('schedule (every 4 hours plus 5 p.m., Asia/Manila)', () => {
    it.each([
      // Manila 09:30 -> 12:00 Manila (04:00Z)
      ['2026-10-22T01:30:00Z', '2026-10-22T04:00:00Z'],
      // Manila 16:00 exactly -> 17:00 Manila
      ['2026-10-22T08:00:00Z', '2026-10-22T09:00:00Z'],
      // Manila 17:10 -> 20:00 Manila
      ['2026-10-22T09:10:00Z', '2026-10-22T12:00:00Z'],
      // Manila 22:00 -> next day 00:00 Manila (16:00Z)
      ['2026-10-22T14:00:00Z', '2026-10-22T16:00:00Z'],
    ])('after %s runs next at %s', (now, expected) => {
      expect(nextScheduledBackup(new Date(now)).toISOString()).toBe(
        new Date(expected).toISOString(),
      );
    });
  });

  it('keys days and Monday-based weeks in Manila time', () => {
    // 2026-10-25T17:00Z is Monday 2026-10-26 01:00 in Manila.
    expect(manilaDayKey(new Date('2026-10-25T17:00:00Z'))).toBe('2026-10-26');
    expect(manilaWeekKey(new Date('2026-10-25T17:00:00Z'))).toBe('2026-10-26');
    expect(manilaWeekKey(new Date('2026-10-25T15:00:00Z'))).toBe('2026-10-19');
  });

  describe('retention (48 h all, 14 daily, 4 weekly)', () => {
    const now = new Date('2026-10-22T04:00:00Z');
    const at = (hoursAgo: number, id = `b${hoursAgo}`) => ({
      id,
      startedAt: new Date(now.getTime() - hoursAgo * HOUR),
    });

    it('keeps every point from the last 48 hours', () => {
      const recent = [0, 4, 8, 12, 24, 36, 47].map((hours) => at(hours));
      expect(selectBackupsToPrune(recent, now)).toEqual([]);
    });

    it('keeps only the newest point of each older day within 14 days', () => {
      // Three points on the same Manila day, five days ago.
      const day = [120, 121, 122].map((hours) => at(hours));
      const pruned = selectBackupsToPrune(day, now).map((item) => item.id);
      expect(pruned).toEqual(['b121', 'b122']);
    });

    it('keeps one point per week up to four weeks, then prunes everything', () => {
      const backups = [
        at(20 * 24), // day 20: weekly window
        at(20 * 24 + 1), // same week, older: pruned
        at(40 * 24), // beyond four weeks: pruned
      ];
      const pruned = selectBackupsToPrune(backups, now).map((item) => item.id);
      expect(pruned).toEqual([`b${20 * 24 + 1}`, `b${40 * 24}`]);
    });
  });
});
