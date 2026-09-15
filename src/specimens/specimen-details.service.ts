import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageUnit } from '../storage-locations/entities/storage-unit.entity';
import { SpecimenLot } from '../specimen-lots/entities/specimen-lot.entity';
import { MuseumCollection } from './entities/collection.entity';
import {
  SpecimenDetail,
  SpecimenDetailLot,
} from './entities/specimen-detail.entity';
import { SpecimenMedia } from './entities/specimen-media.entity';
import { SpecimenProvenance } from './entities/specimen-provenance.entity';
import { SpecimenTaxonomy } from './entities/specimen-taxonomy.entity';
import {
  Specimen,
  SpecimenGender,
  SpecimenStatus,
} from './entities/specimen.entity';
import { Tag } from './entities/tag.entity';

const SPECIMEN_DETAIL_INCLUDE = {
  collection: true,
  specimen_taxonomy: true,
  specimen_provenance: true,
  specimen_lot: {
    where: { is_active: true },
    include: { storage_unit: true },
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  },
  specimen_media: {
    orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
  },
  specimen_tag: {
    include: { tag: true },
  },
} satisfies Prisma.specimenInclude;

type SpecimenDetailRecord = Prisma.specimenGetPayload<{
  include: typeof SPECIMEN_DETAIL_INCLUDE;
}>;

@Injectable()
export class SpecimenDetailsService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(specimenId: string): Promise<SpecimenDetail> {
    const record = await this.prisma.specimen.findUnique({
      where: { id: specimenId },
      include: SPECIMEN_DETAIL_INCLUDE,
    });

    if (!record) {
      throw new NotFoundException(`Specimen ${specimenId} not found`);
    }

    const activeLots: SpecimenDetailLot[] = record.specimen_lot.map((lot) => ({
      ...this.toLot(lot),
      storageUnit: this.toStorageUnit(lot.storage_unit),
    }));

    return {
      specimen: this.toSpecimen(record),
      collection: record.collection
        ? this.toCollection(record.collection)
        : null,
      taxonomy: record.specimen_taxonomy
        ? this.toTaxonomy(record.specimen_taxonomy)
        : null,
      provenance: record.specimen_provenance
        ? this.toProvenance(record.specimen_provenance)
        : null,
      activeLots,
      lotOverview: {
        activeLotCount: activeLots.length,
        totalQuantity: activeLots.reduce(
          (total, lot) => total + lot.quantity,
          0,
        ),
      },
      media: record.specimen_media.map((item) => this.toMedia(item)),
      tags: record.specimen_tag
        .map((item) => this.toTag(item.tag))
        .sort(
          (left, right) =>
            left.name.localeCompare(right.name, undefined, {
              sensitivity: 'base',
            }) || left.id.localeCompare(right.id),
        ),
    };
  }

  private toSpecimen(item: SpecimenDetailRecord): Specimen {
    return {
      id: item.id,
      collectionId: item.collection_id,
      accessionNumber: item.accession_number,
      specimenCategory: item.specimen_category,
      scientificName: item.scientific_name,
      commonName: item.common_name,
      gender: item.gender as SpecimenGender | null,
      classificationStatus: item.classification_status,
      status: item.status as SpecimenStatus,
      publicDisplay: item.public_display_allowed,
      remarks: item.remarks,
      createdBy: item.created_by,
      updatedBy: item.updated_by,
      archivedBy: item.archived_by,
      archivedAt: item.archived_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  private toCollection(
    item: NonNullable<SpecimenDetailRecord['collection']>,
  ): MuseumCollection {
    return {
      id: item.id,
      collectionName: item.collection_name,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  private toTaxonomy(
    item: NonNullable<SpecimenDetailRecord['specimen_taxonomy']>,
  ): SpecimenTaxonomy {
    return {
      specimenId: item.specimen_id,
      kingdom: item.kingdom,
      phylum: item.phylum,
      class: item.class,
      orderName: item.order_name,
      family: item.family,
      genus: item.genus,
      species: item.species,
      habitat: item.habitat,
      ecologicalRole: item.ecological_role,
      conservationStatus: item.conservation_status,
    };
  }

  private toProvenance(
    item: NonNullable<SpecimenDetailRecord['specimen_provenance']>,
  ): SpecimenProvenance {
    return {
      specimenId: item.specimen_id,
      collector: item.collector,
      donor: item.donor,
      collectionDate: item.collection_date
        ? item.collection_date.toISOString().slice(0, 10)
        : null,
      collectionLocation: item.collection_location,
      preservationType: item.preservation_type,
      preservationMethod: item.preservation_method,
      updatedAt: item.updated_at,
    };
  }

  private toLot(
    item: SpecimenDetailRecord['specimen_lot'][number],
  ): SpecimenLot {
    return {
      id: item.id,
      specimenId: item.specimen_id,
      storageUnitId: item.storage_unit_id,
      conditionClass: item.condition_class,
      quantity: item.quantity,
      storageNotes: item.storage_notes,
      isActive: item.is_active,
      createdBy: item.created_by,
      updatedBy: item.updated_by,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  private toStorageUnit(
    item: SpecimenDetailRecord['specimen_lot'][number]['storage_unit'],
  ): StorageUnit {
    return {
      id: item.id,
      parentId: item.parent_id,
      unitType: item.unit_type,
      label: item.label,
      size: item.size,
      storageType: item.storage_type,
      holdsSpecimens: item.holds_specimens,
      capacity: item.capacity,
      archivedAt: item.archived_at,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }

  private toMedia(
    item: SpecimenDetailRecord['specimen_media'][number],
  ): SpecimenMedia {
    return {
      id: item.id,
      specimenId: item.specimen_id,
      storagePath: item.storage_path,
      displayOrder: item.display_order,
      caption: item.caption,
      isCover: item.is_cover,
      createdAt: item.created_at,
    };
  }

  private toTag(
    item: SpecimenDetailRecord['specimen_tag'][number]['tag'],
  ): Tag {
    return { id: item.id, name: item.tag_name };
  }
}
