import { Logger } from '@nestjs/common';
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

const logger = new Logger('StorageLocationPaths');

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
    const { path, isComplete } = walkToRoot(unitsById, unitId);
    if (path.length > 0) {
      if (!isComplete) {
        logger.warn(
          `Storage unit ${unitId} has an incomplete hierarchy (missing ancestor or parent cycle); its derived path stops at ${path[0].id}.`,
        );
      }
      locations.set(unitId, {
        path,
        rootUnit: path[0],
        pathLabel: path.map((segment) => segment.label).join(PATH_SEPARATOR),
        isComplete,
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
  parent_id: string | null;
  label: string;
  unit_type: string;
}): StorageLocationSummary {
  const segment = { id: unit.id, label: unit.label, unitType: unit.unit_type };
  return {
    path: [segment],
    rootUnit: segment,
    pathLabel: unit.label,
    isComplete: unit.parent_id === null,
  };
}

function walkToRoot(
  unitsById: ReadonlyMap<string, AncestorRow>,
  unitId: string,
): { path: StorageLocationPathSegment[]; isComplete: boolean } {
  const path: StorageLocationPathSegment[] = [];
  const visited = new Set<string>();
  let current = unitsById.get(unitId);
  // Complete only when the walk ends at a unit with no parent; stopping on
  // a missing ancestor or a repeated unit leaves a partial path.
  let isComplete = false;

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    path.push({
      id: current.id,
      label: current.label,
      unitType: current.unit_type,
    });
    if (current.parent_id === null) {
      isComplete = true;
      break;
    }
    current = unitsById.get(current.parent_id);
  }

  return { path: path.reverse(), isComplete };
}
