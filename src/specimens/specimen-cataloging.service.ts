import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type specimen_status } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CATALOG_REQUIREMENTS,
  evaluateCatalogRequirements,
} from './catalog-completion.policy';
import { CatalogReadiness } from './entities/catalog-readiness.entity';
import { SpecimenStatus } from './entities/specimen.entity';

/**
 * Reads Cataloging readiness across specimen, taxonomy, provenance, and lot
 * records. Lot and storage data are inspected only; inventory ownership and
 * mutations remain outside this service.
 */
@Injectable()
export class SpecimenCatalogingService {
  constructor(private readonly prisma: PrismaService) {}

  getReadiness(specimenId: string): Promise<CatalogReadiness> {
    return this.getReadinessWith(this.prisma, specimenId);
  }

  async getReadinessWith(
    client: Pick<Prisma.TransactionClient, 'specimen'>,
    specimenId: string,
  ): Promise<CatalogReadiness> {
    const item = await client.specimen.findUnique({
      where: { id: specimenId },
      select: {
        id: true,
        status: true,
        archived_at: true,
        collection_id: true,
        accession_number: true,
        common_name: true,
        specimen_taxonomy: { select: { kingdom: true } },
        specimen_provenance: {
          select: {
            collection_date: true,
            preservation_type: true,
            preservation_method: true,
          },
        },
        specimen_lot: {
          where: {
            is_active: true,
            quantity: { gt: 0 },
            storage_unit: {
              is: { archived_at: null, holds_specimens: true },
            },
          },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`Specimen ${specimenId} not found`);
    }

    const results = evaluateCatalogRequirements({
      collectionId: item.collection_id,
      accessionNumber: item.accession_number,
      commonName: item.common_name,
      kingdom: item.specimen_taxonomy?.kingdom ?? null,
      collectionDate: item.specimen_provenance?.collection_date ?? null,
      preservationType: item.specimen_provenance?.preservation_type ?? null,
      preservationMethod: item.specimen_provenance?.preservation_method ?? null,
      hasActiveLot: item.specimen_lot.length > 0,
    });
    const checks = CATALOG_REQUIREMENTS.map((requirement) => ({
      ...requirement,
      passed: results[requirement.key],
    }));
    const missingRequirements = checks
      .filter((check) => !check.passed)
      .map((check) => check.label);
    const requirementsMet = missingRequirements.length === 0;
    const currentStatus = item.status as SpecimenStatus;

    return {
      specimenId: item.id,
      currentStatus,
      requirementsMet,
      canComplete:
        item.status === 'UNCATALOGED' &&
        item.archived_at === null &&
        requirementsMet,
      checks,
      missingRequirements,
    };
  }

  isArchived(status: specimen_status, archivedAt: Date | null): boolean {
    return status === 'ARCHIVED' || archivedAt !== null;
  }
}
