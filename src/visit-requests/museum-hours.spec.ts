import {
  dayOfWeek,
  describeOpeningHours,
  fitsOpeningHours,
  openingWindows,
} from './museum-hours';

// Spec 0001 AC-2: each preferred time fits one opening window for its day.
// 2030-10-14 is a Monday, 2030-10-19 a Saturday, 2030-10-20 a Sunday.
describe('museum opening hours', () => {
  it('reads the weekday of a calendar date without any time zone shift', () => {
    expect(dayOfWeek('2030-10-14')).toBe(1);
    expect(dayOfWeek('2030-10-19')).toBe(6);
    expect(dayOfWeek('2030-10-20')).toBe(0);
  });

  it.each([
    ['a whole weekday morning window', '2030-10-14', '08:00', '11:00', true],
    ['a whole weekday afternoon window', '2030-10-14', '13:00', '16:00', true],
    ['a short slot inside the morning', '2030-10-14', '09:15', '10:00', true],
    ['a start before opening', '2030-10-14', '07:59', '09:00', false],
    ['an end after the morning closes', '2030-10-14', '10:00', '11:01', false],
    ['a slot across the lunch break', '2030-10-14', '10:30', '13:30', false],
    ['a slot inside the lunch break', '2030-10-14', '11:00', '13:00', false],
    ['an end after closing', '2030-10-14', '15:00', '16:01', false],
    ['the Saturday morning window', '2030-10-19', '08:00', '11:00', true],
    ['a Saturday afternoon', '2030-10-19', '13:00', '14:00', false],
    ['any Sunday time', '2030-10-20', '09:00', '10:00', false],
  ])('covers AC-2: %s', (_label, date, start, end, fits) => {
    expect(fitsOpeningHours(date, start, end)).toBe(fits);
  });

  it.each([
    ['2030-10-14', 'Monday hours are 08:00-11:00 and 13:00-16:00'],
    ['2030-10-19', 'Saturday hours are 08:00-11:00'],
    ['2030-10-20', 'the museum is closed on Sundays'],
  ])('describes the hours for %s', (date, text) => {
    expect(describeOpeningHours(date)).toBe(text);
  });

  it('lists eleven windows for the public form and none on Sunday (AC-6)', () => {
    const windows = openingWindows();

    expect(windows).toHaveLength(11);
    expect(windows.some((window) => window.dayOfWeek === 0)).toBe(false);
    expect(windows.filter((window) => window.dayOfWeek === 6)).toEqual([
      { dayOfWeek: 6, start: '08:00', end: '11:00' },
    ]);
  });
});
