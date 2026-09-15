import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type storage_unit } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenLot } from '../specimen-lots/entities/specimen-lot.entity';
import {
  Specimen,
  SpecimenGender,
  SpecimenStatus,
} from '../specimens/entities/specimen.entity';
import { ListStorageInventoryQueryDto } from './dto/list-storage-inventory-query.dto';
import {
  StorageInventoryItem,
  StorageInventoryPage,
} from './entities/storage-inventory.entity';
import { StorageUnit } from './entities/storage-unit.entity';

const STORAGE_INVENTORY_INCLUDE = {
  specimen: true,
} satisfies Prisma.specimen_lotInclude;

type InventoryLotRecord = Prisma.specimen_lotGetPayload<{
  include: typeof STORAGE_INVENTORY_INCLUDE;
}>;

@Injectable()
export class StorageInventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async findForStorageUnit(
    storageUnitId: string,
    query: ListStorageInventoryQueryDto,
  ): Promise<StorageInventoryPage> {
    const where: Prisma.specimen_lotWhereInput = {
      storage_unit_id: storageUnitId,
      is_active: true,
    };
    const skip = (query.page - 1) * query.limit;

    const [storageUnit, records, inventoryTotals] =
      await this.prisma.$transaction([
        this.prisma.storage_unit.findUnique({
          where: { id: storageUnitId },
        }),
        this.prisma.specimen_lot.findMany({
          where,
          include: STORAGE_INVENTORY_INCLUDE,
          orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
          skip,
          take: query.limit,
        }),
        this.prisma.specimen_lot.aggregate({
          where,
          _count: { id: true },
          _sum: { quantity: true },
        }),
      ]);

    if (!storageUnit) {
      throw new NotFoundException(`Storage unit ${storageUnitId} not found`);
    }

    return {
      storageUnit: this.toStorageUnit(storageUnit),
      items: records.map((record) => this.toInventoryItem(record)),
      totalLots: inventoryTotals._count.id,
      totalQuantity: inventoryTotals._sum.quantity ?? 0,
      page: query.page,
      limit: query.limit,
    };
  }

  private toInventoryItem(item: InventoryLotRecord): StorageInventoryItem {
    return {
      lot: this.toLot(item),
      specimen: this.toSpecimen(item.specimen),
    };
  }

  private toLot(item: InventoryLotRecord): SpecimenLot {
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

  private toSpecimen(item: InventoryLotRecord['specimen']): Specimen {
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

  private toStorageUnit(item: storage_unit): StorageUnit {
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
}
