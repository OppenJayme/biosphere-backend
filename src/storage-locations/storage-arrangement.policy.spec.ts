import { BadRequestException } from '@nestjs/common';
import {
  assertArrangementAllowed,
  isArrangementAllowed,
  normalizeUnitType,
} from './storage-arrangement.policy';

describe('storage arrangement policy', () => {
  it('normalizes case, spaces, and hyphens', () => {
    expect(normalizeUnitType(' shelving-unit ')).toBe('SHELVING_UNIT');
    expect(normalizeUnitType('Room')).toBe('ROOM');
  });

  it.each([
    ['Room', 'Cabinet'],
    ['ROOM', 'shelf'],
    ['CABINET', 'DRAWER'],
    ['Cabinet', 'Box'],
    ['DRAWER', 'VIAL'],
    ['BOX', 'BOX'],
  ])('allows a %s to hold a %s', (parent, child) => {
    expect(isArrangementAllowed(parent, child)).toBe(true);
  });

  it.each([
    ['CABINET', 'ROOM'],
    ['VIAL', 'ROOM'],
    ['DRAWER', 'CABINET'],
    ['DRAWER', 'DRAWER'],
    ['VIAL', 'VIAL'],
    ['BOX', 'SHELF'],
  ])('rejects a %s holding a %s', (parent, child) => {
    expect(isArrangementAllowed(parent, child)).toBe(false);
  });

  it('does not restrict curator-added types that are not on the reviewed list', () => {
    expect(isArrangementAllowed('Herbarium press', 'ROOM')).toBe(true);
    expect(isArrangementAllowed('VIAL', 'Specimen sleeve')).toBe(true);
  });

  it('explains a rejected arrangement with both labels', () => {
    expect(() =>
      assertArrangementAllowed(
        { label: 'Cabinet A', unit_type: 'CABINET' },
        'ROOM',
        'Zoology Room',
      ),
    ).toThrow(
      new BadRequestException(
        '"Zoology Room" (ROOM) cannot be placed inside "Cabinet A" (CABINET). Choose a larger storage unit as its parent.',
      ),
    );
  });
});
