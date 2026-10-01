import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type storage_unit } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenLot } from '../specimen-lots/entities/specimen-lot.entity';
import {
  Specimen,
  SpecimenGender,
  SpecimenStatus,
} from '../specimens/entities/specimen.entity';
import { ListLotHistoryQueryDto } from '../specimen-lots/dto/list-lot-history-query.dto';
import { SpecimenLotHistoryPage } from '../specimen-lots/entities/specimen-lot-history.entity';
import {
  LOT_HISTORY_INCLUDE,
  LOT_HISTORY_ORDER_BY,
  toLotHistoryEntry,
  touchingLots,
} from '../specimen-lots/lot-history';
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

  /**
   * Lot transactions that moved quantity into or out of this unit, or
   * changed lots held in it (REQ-4.6-09). Only this unit's own lots count;
   * child units have their own feed.
   */
  async findLotMovements(
    storageUnitId: string,
    query: ListLotHistoryQueryDto,
  ): Promise<SpecimenLotHistoryPage> {
    const where: Prisma.specimen_lot_transactionWhereInput = {
      ...touchingLots({ storage_unit_id: storageUnitId }),
      transaction_type: query.transactionType,
    };
    const [storageUnit, transactions, total] = await this.prisma.$transaction([
      this.prisma.storage_unit.findUnique({
        where: { id: storageUnitId },
        select: { id: true },
      }),
      this.prisma.specimen_lot_transaction.findMany({
        where,
        include: LOT_HISTORY_INCLUDE,
        orderBy: LOT_HISTORY_ORDER_BY,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.specimen_lot_transaction.count({ where }),
    ]);

    if (!storageUnit) {
      throw new NotFoundException(`Storage unit ${storageUnitId} not found`);
    }

    return {
      items: transactions.map((transaction) => toLotHistoryEntry(transaction)),
      page: query.page,
      limit: query.limit,
      total,
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
