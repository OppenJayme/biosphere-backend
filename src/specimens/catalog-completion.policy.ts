import { BadRequestException } from '@nestjs/common';
import type { specimen_status } from '../generated/prisma/client';

/**
 * Catalog-completion rules that are safe to evaluate without performing a
 * mutation. Keeping the rules here gives readiness checks and edit guards one
 * source of truth while inventory remains owned by its dedicated module.
 */
export const CATALOG_REQUIREMENTS = [
  { key: 'collection', label: 'Collection is assigned' },
  { key: 'accessionNumber', label: 'Accession number is assigned' },
  { key: 'commonName', label: 'Common name is recorded' },
  { key: 'kingdom', label: 'Taxonomic kingdom is recorded' },
  { key: 'collectionDate', label: 'Collection date is recorded' },
  { key: 'preservationType', label: 'Preservation type is recorded' },
  { key: 'preservationMethod', label: 'Preservation method is recorded' },
  {
    key: 'activeLot',
    label:
      'An active lot has positive quantity in a specimen-holding storage location',
  },
] as const;

export type CatalogRequirementKey =
  (typeof CATALOG_REQUIREMENTS)[number]['key'];

export interface CatalogCompletionSnapshot {
  collectionId: string | null;
  accessionNumber: string | null;
  commonName: string | null;
  kingdom: string | null;
  collectionDate: Date | null;
  preservationType: string | null;
  preservationMethod: string | null;
  hasActiveLot: boolean;
}

export function hasCatalogText(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}

export function evaluateCatalogRequirements(
  snapshot: CatalogCompletionSnapshot,
): Record<CatalogRequirementKey, boolean> {
  return {
    collection: snapshot.collectionId !== null,
    accessionNumber: hasCatalogText(snapshot.accessionNumber),
    commonName: hasCatalogText(snapshot.commonName),
    kingdom: hasCatalogText(snapshot.kingdom),
    collectionDate: snapshot.collectionDate !== null,
    preservationType: hasCatalogText(snapshot.preservationType),
    preservationMethod: hasCatalogText(snapshot.preservationMethod),
    activeLot: snapshot.hasActiveLot,
  };
}

/** Prevents a Cataloged record from losing a required value implicitly. */
export function assertCatalogedValueRetained(
  status: specimen_status,
  valueWasSubmitted: boolean,
  valueIsPresent: boolean,
  fieldLabel: string,
): void {
  if (status === 'CATALOGED' && valueWasSubmitted && !valueIsPresent) {
    throw new BadRequestException(
      `${fieldLabel} is required for a Cataloged specimen. Reopen cataloging before removing it.`,
    );
  }
}
