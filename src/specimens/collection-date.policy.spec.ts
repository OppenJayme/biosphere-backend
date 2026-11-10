import { validate } from 'class-validator';
import {
  assertCollectionDate,
  isValidCollectionDate,
  museumToday,
} from './collection-date.policy';
import { CreateSpecimenProvenanceDto } from './dto/create-specimen-provenance.dto';

describe('museum collection-date policy', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-04T16:30:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('uses Manila midnight, not UTC or the server timezone', () => {
    expect(museumToday(new Date('2026-10-04T15:59:59Z'))).toBe('2026-10-04');
    expect(museumToday()).toBe('2026-10-05');
    expect(isValidCollectionDate('2026-10-05')).toBe(true);
    expect(isValidCollectionDate('2026-10-06')).toBe(false);
    expect(isValidCollectionDate('2020-02-29')).toBe(true);
    expect(isValidCollectionDate('2026-02-29')).toBe(false);
    expect(isValidCollectionDate(new Date('invalid'))).toBe(false);
    expect(isValidCollectionDate(null)).toBe(false);
  });

  it('rejects future dates through DTO validation and direct service policy', async () => {
    const dto = Object.assign(new CreateSpecimenProvenanceDto(), {
      collectionDate: '2026-10-06',
    });
    expect(await validate(dto)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          property: 'collectionDate',
          constraints: expect.objectContaining({
            isValidCollectionDate: expect.any(String),
          }),
        }),
      ]),
    );
    expect(() => assertCollectionDate('2026-10-06')).toThrow(
      /on or before today/,
    );
    expect(() => assertCollectionDate(null)).not.toThrow();
    dto.collectionDate = '2026-10-05';
    expect(await validate(dto)).toEqual([]);
  });
});
