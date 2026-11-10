import { BadRequestException } from '@nestjs/common';

/**
 * Storage arrangement rules (client proposal §6; team decision the Curator
 * left unchanged on 2026-11-07). Each recognised unit type has a tier; a unit may only sit inside a
 * parent of a strictly higher tier, so impossible arrangements such as a room
 * inside a cabinet or vial are rejected, while skipping tiers is allowed
 * (a box directly inside a cabinet). Containers may nest inside containers.
 *
 * `unit_type` stays curator-extensible text: values are compared after
 * normalisation (case, spaces, hyphens), and a type not listed here is not
 * restricted until the museum adds it to the reviewed list.
 */
export const STORAGE_ARRANGEMENT_TIERS = [
  {
    tier: 1,
    name: 'Space',
    types: ['BUILDING', 'ROOM', 'GALLERY', 'STOREROOM', 'LABORATORY'],
  },
  {
    tier: 2,
    name: 'Furniture',
    types: ['CABINET', 'SHELVING_UNIT', 'RACK', 'COMPACTOR', 'FREEZER', 'TANK'],
  },
  { tier: 3, name: 'Compartment', types: ['SHELF', 'DRAWER', 'TRAY'] },
  {
    tier: 4,
    name: 'Container',
    types: ['BOX', 'JAR', 'BOTTLE', 'CONTAINER', 'BAG'],
  },
  {
    tier: 5,
    name: 'Primary container',
    types: ['VIAL', 'TUBE', 'SLIDE', 'ENVELOPE'],
  },
] as const;

/** Tiers whose units may also be placed inside a unit of the same tier. */
const SAME_TIER_NESTING = new Set<number>([4]);

const TIER_BY_TYPE = new Map<string, number>(
  STORAGE_ARRANGEMENT_TIERS.flatMap(({ tier, types }) =>
    types.map((type) => [type, tier] as const),
  ),
);

export function normalizeUnitType(unitType: string): string {
  return unitType
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

export function unitTypeTier(unitType: string): number | undefined {
  return TIER_BY_TYPE.get(normalizeUnitType(unitType));
}

export function isArrangementAllowed(
  parentUnitType: string,
  childUnitType: string,
): boolean {
  const parentTier = unitTypeTier(parentUnitType);
  const childTier = unitTypeTier(childUnitType);
  if (parentTier === undefined || childTier === undefined) return true;
  if (childTier > parentTier) return true;
  return childTier === parentTier && SAME_TIER_NESTING.has(childTier);
}

export function assertArrangementAllowed(
  parent: { unit_type: string; label: string },
  childUnitType: string,
  childLabel?: string,
): void {
  if (isArrangementAllowed(parent.unit_type, childUnitType)) return;
  const child = childLabel
    ? `"${childLabel}" (${childUnitType})`
    : `A ${childUnitType}`;
  throw new BadRequestException(
    `${child} cannot be placed inside "${parent.label}" (${parent.unit_type}). Choose a larger storage unit as its parent.`,
  );
}
