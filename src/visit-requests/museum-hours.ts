import { ApiProperty } from '@nestjs/swagger';

// Museum opening hours, as published in the public website footer
// (biosphere-frontend PublicFooter, given by the museum on 2026-11-07). The
// museum closes over lunch on weekdays and on Sundays. Visit requests may
// fall on any open day, including Saturday, but each preferred time must
// fit inside one opening window (team decision 2026-11-11). Holidays are
// not listed anywhere yet, so they are not blocked here.
// Keys are JavaScript day numbers: 0 = Sunday ... 6 = Saturday.
export const MUSEUM_OPENING_HOURS: Readonly<
  Record<number, readonly { start: string; end: string }[]>
> = {
  1: [
    { start: '08:00', end: '11:00' },
    { start: '13:00', end: '16:00' },
  ],
  2: [
    { start: '08:00', end: '11:00' },
    { start: '13:00', end: '16:00' },
  ],
  3: [
    { start: '08:00', end: '11:00' },
    { start: '13:00', end: '16:00' },
  ],
  4: [
    { start: '08:00', end: '11:00' },
    { start: '13:00', end: '16:00' },
  ],
  5: [
    { start: '08:00', end: '11:00' },
    { start: '13:00', end: '16:00' },
  ],
  6: [{ start: '08:00', end: '11:00' }],
};

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

export class OpeningWindow {
  @ApiProperty({ example: 1, description: '0 = Sunday ... 6 = Saturday' })
  dayOfWeek!: number;

  @ApiProperty({ example: '08:00' })
  start!: string;

  @ApiProperty({ example: '11:00' })
  end!: string;
}

// Every opening window, for the public form to offer valid times.
export function openingWindows(): OpeningWindow[] {
  return Object.entries(MUSEUM_OPENING_HOURS).flatMap(([day, windows]) =>
    windows.map((window) => ({ dayOfWeek: Number(day), ...window })),
  );
}

// YYYY-MM-DD is a calendar date, so read its weekday in UTC.
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

// True when start-end sits entirely inside one opening window that day.
export function fitsOpeningHours(
  date: string,
  startTime: string,
  endTime: string,
): boolean {
  return (MUSEUM_OPENING_HOURS[dayOfWeek(date)] ?? []).some(
    (window) => startTime >= window.start && endTime <= window.end,
  );
}

// "Saturday: 08:00-11:00" or "Sunday: closed", for error messages.
export function describeOpeningHours(date: string): string {
  const day = dayOfWeek(date);
  const windows = MUSEUM_OPENING_HOURS[day] ?? [];
  return windows.length === 0
    ? `the museum is closed on ${DAY_NAMES[day]}s`
    : `${DAY_NAMES[day]} hours are ${windows
        .map((window) => `${window.start}-${window.end}`)
        .join(' and ')}`;
}
