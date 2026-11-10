import { BadRequestException } from '@nestjs/common';
import { calendarDateRange, submittedAtRange } from './date-filter';

describe('date filters', () => {
  describe('submittedAtRange', () => {
    it('covers whole museum days (UTC+8), both ends inclusive', () => {
      expect(submittedAtRange('2026-09-01', '2026-09-01')).toEqual({
        gte: new Date('2026-08-31T16:00:00.000Z'),
        lt: new Date('2026-09-01T16:00:00.000Z'),
      });
    });

    it('allows an open end', () => {
      expect(submittedAtRange(undefined, '2026-09-01')).toEqual({
        lt: new Date('2026-09-01T16:00:00.000Z'),
      });
      expect(submittedAtRange(undefined, undefined)).toBeUndefined();
    });

    it.each([
      ['a reversed range', '2026-09-02', '2026-09-01'],
      ['an impossible date', '2026-02-30', undefined],
    ])('rejects %s', (_label, from, to) => {
      expect(() => submittedAtRange(from, to)).toThrow(BadRequestException);
    });
  });

  describe('calendarDateRange', () => {
    it('matches @db.Date values at midnight UTC', () => {
      expect(
        calendarDateRange('2026-10-01', '2026-10-31', ['from', 'to']),
      ).toEqual({
        gte: new Date('2026-10-01T00:00:00.000Z'),
        lte: new Date('2026-10-31T00:00:00.000Z'),
      });
    });

    it('names the offending field', () => {
      expect(() =>
        calendarDateRange('2026-04-31', undefined, [
          'visitDateFrom',
          'visitDateTo',
        ]),
      ).toThrow('visitDateFrom is not a real date.');
    });
  });
});
