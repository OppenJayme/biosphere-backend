import {
  ImportStorageUnitResolver,
  splitStorageUnitPath,
} from './import-storage-unit.resolver';

const ROOM = '11111111-1111-4111-8111-111111111111';
const CABINET = '22222222-2222-4222-8222-222222222222';
const DRAWER = '33333333-3333-4333-8333-333333333333';
const OLD_DRAWER = '44444444-4444-4444-8444-444444444444';

const resolver = new ImportStorageUnitResolver([
  {
    id: ROOM,
    parent_id: null,
    label: 'Zoology  Room',
    holds_specimens: false,
    archived_at: null,
  },
  {
    id: CABINET,
    parent_id: ROOM,
    label: 'Cabinet A',
    holds_specimens: false,
    archived_at: null,
  },
  {
    id: DRAWER,
    parent_id: CABINET,
    label: 'Drawer 1',
    holds_specimens: true,
    archived_at: null,
  },
  {
    id: OLD_DRAWER,
    parent_id: CABINET,
    label: 'Drawer 2',
    holds_specimens: true,
    archived_at: new Date('2026-01-01T00:00:00.000Z'),
  },
]);

describe('splitStorageUnitPath', () => {
  it('accepts >, › and / separators and normalizes each label', () => {
    expect(
      splitStorageUnitPath(' Zoology  Room >Cabinet A/ drawer 1 '),
    ).toEqual(['zoology room', 'cabinet a', 'drawer 1']);
  });
});

describe('ImportStorageUnitResolver', () => {
  it('resolves a full or shortened label path and a UUID', () => {
    expect(resolver.resolve('Zoology Room > Cabinet A > Drawer 1')).toEqual({
      storageUnitId: DRAWER,
    });
    expect(resolver.resolve('drawer 1')).toEqual({ storageUnitId: DRAWER });
    expect(resolver.resolve(DRAWER)).toEqual({ storageUnitId: DRAWER });
  });

  it('rejects units that cannot receive a lot', () => {
    expect(resolver.resolve('Cabinet A')).toEqual({
      error:
        'Storage unit "Zoology  Room > Cabinet A" is not configured to hold specimens.',
    });
    expect(resolver.resolve(OLD_DRAWER)).toEqual({
      error: 'Storage unit "Zoology  Room > Cabinet A > Drawer 2" is archived.',
    });
    expect(resolver.resolve('Drawer 2')).toEqual({
      error: expect.stringMatching(/^No active storage unit matches/),
    });
  });

  it('rejects unknown UUIDs, wrong parents, and empty paths', () => {
    expect(resolver.resolve('55555555-5555-4555-8555-555555555555')).toEqual({
      error:
        'Storage unit 55555555-5555-4555-8555-555555555555 does not exist.',
    });
    expect(resolver.resolve('Botany Room > Drawer 1')).toEqual({
      error: expect.stringMatching(/^No active storage unit matches/),
    });
    expect(resolver.resolve(' > ')).toEqual({
      error: 'Storage unit must name a unit.',
    });
  });
});
