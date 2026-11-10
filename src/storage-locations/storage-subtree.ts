import type { PrismaService } from '../prisma/prisma.service';

type StorageUnitReader = Pick<PrismaService, 'storage_unit'>;

// Real hierarchies are a handful of levels deep. The limit only stops a
// corrupted parent cycle from looping.
const MAX_HIERARCHY_DEPTH = 32;

/**
 * Returns the unit id followed by every descendant unit id, loading one
 * hierarchy level per query. Archived descendants are included because
 * their lots still describe where specimens were placed.
 */
export async function findStorageSubtreeIds(
  reader: StorageUnitReader,
  rootId: string,
): Promise<string[]> {
  const ids = new Set<string>([rootId]);
  let frontier = [rootId];

  for (
    let depth = 0;
    frontier.length > 0 && depth < MAX_HIERARCHY_DEPTH;
    depth += 1
  ) {
    const children = await reader.storage_unit.findMany({
      where: { parent_id: { in: frontier } },
      select: { id: true },
    });
    frontier = children
      .map((child) => child.id)
      .filter((childId) => !ids.has(childId));
    for (const childId of frontier) {
      ids.add(childId);
    }
  }

  return [...ids];
}
