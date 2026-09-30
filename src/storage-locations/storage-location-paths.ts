import type { PrismaService } from '../prisma/prisma.service';
import {
  StorageLocationPathSegment,
  StorageLocationSummary,
} from './entities/storage-location-path.entity';

type StorageUnitReader = Pick<PrismaService, 'storage_unit'>;

type AncestorRow = {
  id: string;
  parent_id: string | null;
  label: string;
  unit_type: string;
};

const PATH_SEPARATOR = ' › ';
// Real hierarchies are a handful of levels deep (room › cabinet › drawer ›
// box › vial). The limit only stops a corrupted parent cycle from looping.
const MAX_HIERARCHY_DEPTH = 32;

/**
 * Resolves the root-to-unit path for each requested storage unit, loading
 * one hierarchy level per query no matter how many units are requested.
 * Units whose ancestry is missing or cyclic resolve to the portion that
 * could be walked, ending at the requested unit.
 */
export async function resolveStorageLocations(
  reader: StorageUnitReader,
  storageUnitIds: readonly string[],
): Promise<Map<string, StorageLocationSummary>> {
  const unitsById = new Map<string, AncestorRow>();
  let pending = [...new Set(storageUnitIds)];

  for (
    let depth = 0;
    pending.length > 0 && depth < MAX_HIERARCHY_DEPTH;
    depth += 1
  ) {
    const rows = await reader.storage_unit.findMany({
      where: { id: { in: pending } },
      select: { id: true, parent_id: true, label: true, unit_type: true },
    });
    for (const row of rows) {
      unitsById.set(row.id, row);
    }
    pending = [
      ...new Set(
        rows
          .map((row) => row.parent_id)
          .filter(
            (parentId): parentId is string =>
              parentId !== null && !unitsById.has(parentId),
          ),
      ),
    ];
  }

  const locations = new Map<string, StorageLocationSummary>();
  for (const unitId of new Set(storageUnitIds)) {
    const path = walkToRoot(unitsById, unitId);
    if (path.length > 0) {
      locations.set(unitId, {
        path,
        rootUnit: path[0],
        pathLabel: path.map((segment) => segment.label).join(PATH_SEPARATOR),
      });
    }
  }

  return locations;
}

/**
 * Location for a unit whose ancestors could not be resolved: the unit alone.
 */
export function unitOnlyLocation(unit: {
  id: string;
  label: string;
  unit_type: string;
}): StorageLocationSummary {
  const segment = { id: unit.id, label: unit.label, unitType: unit.unit_type };
  return { path: [segment], rootUnit: segment, pathLabel: unit.label };
}

function walkToRoot(
  unitsById: ReadonlyMap<string, AncestorRow>,
  unitId: string,
): StorageLocationPathSegment[] {
  const path: StorageLocationPathSegment[] = [];
  const visited = new Set<string>();
  let current = unitsById.get(unitId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.push({
      id: current.id,
      label: current.label,
      unitType: current.unit_type,
    });
    current = current.parent_id ? unitsById.get(current.parent_id) : undefined;
  }

  return path.reverse();
}
