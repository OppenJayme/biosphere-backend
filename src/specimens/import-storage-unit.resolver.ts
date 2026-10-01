import { isUUID } from 'class-validator';

export interface ImportStorageUnitRow {
  id: string;
  parent_id: string | null;
  label: string;
  holds_specimens: boolean;
  archived_at: Date | null;
}

export type StorageUnitResolution =
  { storageUnitId: string } | { error: string };

const PATH_SEPARATORS = /\s*[>›/]\s*/;

function normalizeSegment(segment: string): string {
  return segment.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function splitStorageUnitPath(path: string): string[] {
  return path
    .split(PATH_SEPARATORS)
    .map(normalizeSegment)
    .filter((segment) => segment.length > 0);
}

/**
 * Resolves the storage-unit reference of an import row. A spreadsheet can
 * give a unit UUID, or its labels from the top down separated by ">", "›"
 * or "/", such as "Zoology Room > Cabinet A > Drawer 3". Leading levels may
 * be left out ("Cabinet A > Drawer 3", or just "Drawer 3") as long as the
 * remaining labels identify exactly one active unit. Labels ignore case.
 */
export class ImportStorageUnitResolver {
  private readonly unitsById: Map<string, ImportStorageUnitRow>;
  private readonly segmentsById = new Map<string, string[]>();

  constructor(units: ImportStorageUnitRow[]) {
    this.unitsById = new Map(units.map((unit) => [unit.id, unit]));
  }

  resolve(reference: string): StorageUnitResolution {
    if (isUUID(reference)) {
      const unit = this.unitsById.get(reference);
      return unit
        ? this.checkAssignable(unit)
        : { error: `Storage unit ${reference} does not exist.` };
    }

    const wanted = splitStorageUnitPath(reference);
    if (wanted.length === 0) {
      return { error: 'Storage unit must name a unit.' };
    }

    const matches = [...this.unitsById.values()].filter(
      (unit) =>
        unit.archived_at === null &&
        this.endsWith(this.segmentsFor(unit.id), wanted),
    );
    if (matches.length === 0) {
      return {
        error: `No active storage unit matches "${reference}". Use the labels from the room down, separated by ">".`,
      };
    }
    if (matches.length > 1) {
      const paths = matches
        .slice(0, 3)
        .map((unit) => `"${this.labelPath(unit.id)}"`)
        .join(', ');
      return {
        error: `"${reference}" matches ${matches.length} storage units (${paths}${matches.length > 3 ? ', …' : ''}). Add the parent labels to pick one.`,
      };
    }

    return this.checkAssignable(matches[0]);
  }

  private checkAssignable(unit: ImportStorageUnitRow): StorageUnitResolution {
    if (unit.archived_at) {
      return {
        error: `Storage unit "${this.labelPath(unit.id)}" is archived.`,
      };
    }
    if (!unit.holds_specimens) {
      return {
        error: `Storage unit "${this.labelPath(unit.id)}" is not configured to hold specimens.`,
      };
    }
    return { storageUnitId: unit.id };
  }

  private endsWith(path: string[], suffix: string[]): boolean {
    if (suffix.length > path.length) return false;
    const offset = path.length - suffix.length;
    return suffix.every((segment, index) => path[offset + index] === segment);
  }

  private segmentsFor(unitId: string): string[] {
    const cached = this.segmentsById.get(unitId);
    if (cached) return cached;

    const labels = this.labelsFromRoot(unitId).map(normalizeSegment);
    this.segmentsById.set(unitId, labels);
    return labels;
  }

  private labelPath(unitId: string): string {
    return this.labelsFromRoot(unitId).join(' > ');
  }

  private labelsFromRoot(unitId: string): string[] {
    const labels: string[] = [];
    const visited = new Set<string>();
    let current = this.unitsById.get(unitId);
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      labels.push(current.label);
      current = current.parent_id
        ? this.unitsById.get(current.parent_id)
        : undefined;
    }
    return labels.reverse();
  }
}
