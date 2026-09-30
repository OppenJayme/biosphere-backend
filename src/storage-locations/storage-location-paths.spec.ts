import type { PrismaService } from '../prisma/prisma.service';
import {
  resolveStorageLocations,
  unitOnlyLocation,
} from './storage-location-paths';

type Row = {
  id: string;
  parent_id: string | null;
  label: string;
  unit_type: string;
};

function readerFor(rows: Row[]) {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const findMany = jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
    Promise.resolve(
      where.id.in
        .map((id) => byId.get(id))
        .filter((row): row is Row => row !== undefined),
    ),
  );
  return {
    findMany,
    reader: { storage_unit: { findMany } } as unknown as Pick<
      PrismaService,
      'storage_unit'
    >,
  };
}

const room = { id: 'room', parent_id: null, label: 'Room', unit_type: 'ROOM' };
const cabinet = {
  id: 'cabinet',
  parent_id: 'room',
  label: 'Cabinet A',
  unit_type: 'CABINET',
};
const drawerOne = {
  id: 'drawer-1',
  parent_id: 'cabinet',
  label: 'Drawer 1',
  unit_type: 'DRAWER',
};
const drawerTwo = { ...drawerOne, id: 'drawer-2', label: 'Drawer 2' };

describe('resolveStorageLocations', () => {
  it('loads one hierarchy level per query and shares ancestors', async () => {
    const { reader, findMany } = readerFor([
      room,
      cabinet,
      drawerOne,
      drawerTwo,
    ]);

    const locations = await resolveStorageLocations(reader, [
      'drawer-1',
      'drawer-2',
      'drawer-1',
    ]);

    expect(findMany).toHaveBeenCalledTimes(3);
    expect(locations.get('drawer-2')?.pathLabel).toBe(
      'Room › Cabinet A › Drawer 2',
    );
    expect(locations.get('drawer-1')?.rootUnit).toEqual({
      id: 'room',
      label: 'Room',
      unitType: 'ROOM',
    });
  });

  it('stops at a missing parent or a corrupted cycle', async () => {
    const { reader } = readerFor([
      { ...cabinet, parent_id: 'gone' },
      { id: 'a', parent_id: 'b', label: 'A', unit_type: 'BOX' },
      { id: 'b', parent_id: 'a', label: 'B', unit_type: 'BOX' },
    ]);

    const locations = await resolveStorageLocations(reader, ['cabinet', 'a']);

    expect(locations.get('cabinet')?.pathLabel).toBe('Cabinet A');
    expect(locations.get('a')?.pathLabel).toBe('B › A');
  });

  it('omits unknown units', async () => {
    const { reader } = readerFor([]);

    await expect(resolveStorageLocations(reader, ['nope'])).resolves.toEqual(
      new Map(),
    );
  });
});

describe('unitOnlyLocation', () => {
  it('describes a unit as its own single-segment path', () => {
    expect(unitOnlyLocation(cabinet)).toEqual({
      path: [{ id: 'cabinet', label: 'Cabinet A', unitType: 'CABINET' }],
      rootUnit: { id: 'cabinet', label: 'Cabinet A', unitType: 'CABINET' },
      pathLabel: 'Cabinet A',
    });
  });
});
