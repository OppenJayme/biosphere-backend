import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type storage_movement_history,
  type storage_unit,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStorageUnitDto } from './dto/create-storage-unit.dto';
import { MoveStorageUnitDto } from './dto/move-storage-unit.dto';
import {
  SearchStorageLocationsQueryDto,
  StorageUnitLifecycleFilter,
} from './dto/search-storage-locations-query.dto';
import { UpdateStorageUnitDto } from './dto/update-storage-unit.dto';
import { StorageMovement } from './entities/storage-movement.entity';
import { StorageUnit, StorageUnitPage } from './entities/storage-unit.entity';

type StorageHierarchyReader = {
  storage_unit: {
    findUnique(args: { where: { id: string } }): Promise<storage_unit | null>;
  };
};

const SERIALIZABLE_RETRY_LIMIT = 3;

@Injectable()
export class StorageLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateStorageUnitDto,
    actingCuratorAccountId: string,
  ): Promise<StorageUnit> {
    return this.runSerializableMutation(async (transaction) => {
      if (dto.parentId) {
        const parent = await transaction.storage_unit.findUnique({
          where: { id: dto.parentId },
        });
        this.assertUsableParent(parent, dto.parentId);
      }

      const unit = await transaction.storage_unit.create({
        data: {
          parent_id: dto.parentId,
          unit_type: dto.unitType,
          label: dto.label,
          size: dto.size,
          storage_type: dto.storageType,
          holds_specimens: dto.holdsSpecimens,
          capacity: dto.capacity,
        },
      });

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        unitId: unit.id,
        action: 'CREATE_STORAGE_UNIT',
        details: {
          parentId: unit.parent_id,
          unitType: unit.unit_type,
          storageType: unit.storage_type,
        },
      });

      return this.toEntity(unit);
    });
  }

  async findAll(): Promise<StorageUnit[]> {
    const units = await this.prisma.storage_unit.findMany({
      orderBy: [{ label: 'asc' }, { created_at: 'asc' }],
    });

    return units.map((unit) => this.toEntity(unit));
  }

  async search(
    query: SearchStorageLocationsQueryDto,
  ): Promise<StorageUnitPage> {
    const where: Prisma.storage_unitWhereInput = {
      label: query.search
        ? {
            contains: query.search,
            mode: Prisma.QueryMode.insensitive,
          }
        : undefined,
      unit_type: query.unitType
        ? {
            equals: query.unitType,
            mode: Prisma.QueryMode.insensitive,
          }
        : undefined,
      storage_type: query.storageType
        ? {
            equals: query.storageType,
            mode: Prisma.QueryMode.insensitive,
          }
        : undefined,
      holds_specimens: query.holdsSpecimens,
      archived_at:
        query.lifecycle === StorageUnitLifecycleFilter.ACTIVE
          ? null
          : query.lifecycle === StorageUnitLifecycleFilter.ARCHIVED
            ? { not: null }
            : undefined,
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.storage_unit.findMany({
        where,
        orderBy: [{ label: 'asc' }, { id: 'asc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.storage_unit.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(id: string): Promise<StorageUnit> {
    return this.toEntity(await this.findOneOrThrow(id));
  }

  async findPath(id: string): Promise<StorageUnit[]> {
    return this.prisma.$transaction(
      async (transaction) => {
        const selected = await transaction.storage_unit.findUnique({
          where: { id },
        });
        if (!selected) {
          throw new NotFoundException(`Storage unit ${id} not found`);
        }

        const path = [selected];
        const visited = new Set<string>([selected.id]);
        let parentId = selected.parent_id;

        while (parentId) {
          if (visited.has(parentId)) {
            throw new ConflictException(
              'The stored storage hierarchy contains a cycle and cannot be resolved.',
            );
          }

          const parent = await transaction.storage_unit.findUnique({
            where: { id: parentId },
          });
          if (!parent) {
            throw new ConflictException(
              'The stored storage hierarchy references a missing parent.',
            );
          }

          path.push(parent);
          visited.add(parent.id);
          parentId = parent.parent_id;
        }

        return path.reverse().map((unit) => this.toEntity(unit));
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async findChildren(id: string): Promise<StorageUnit[]> {
    await this.findOneOrThrow(id);

    const children = await this.prisma.storage_unit.findMany({
      where: { parent_id: id },
      orderBy: [{ label: 'asc' }, { created_at: 'asc' }],
    });

    return children.map((unit) => this.toEntity(unit));
  }

  async findMovementHistory(id: string): Promise<StorageMovement[]> {
    await this.findOneOrThrow(id);

    const movements = await this.prisma.storage_movement_history.findMany({
      where: { storage_unit_id: id },
      orderBy: { moved_at: 'desc' },
    });

    return movements.map((movement) => this.toMovementEntity(movement));
  }

  async update(
    id: string,
    dto: UpdateStorageUnitDto,
    actingCuratorAccountId: string,
  ): Promise<StorageUnit> {
    return this.runSerializableMutation(async (transaction) => {
      const existing = await this.findOneOrThrow(id, transaction);
      this.assertActive(existing);

      if (dto.holdsSpecimens === false && existing.holds_specimens) {
        const activeLots = await transaction.specimen_lot.count({
          where: { storage_unit_id: id, is_active: true },
        });

        if (activeLots > 0) {
          throw new BadRequestException(
            "Move or deactivate this storage unit's active specimen lots before disabling specimen storage.",
          );
        }
      }

      const data: Prisma.storage_unitUncheckedUpdateInput = {};
      const changedFields: string[] = [];

      if (dto.label !== undefined && dto.label !== existing.label) {
        data.label = dto.label;
        changedFields.push('label');
      }
      if (dto.unitType !== undefined && dto.unitType !== existing.unit_type) {
        data.unit_type = dto.unitType;
        changedFields.push('unitType');
      }
      if (
        dto.storageType !== undefined &&
        dto.storageType !== existing.storage_type
      ) {
        data.storage_type = dto.storageType;
        changedFields.push('storageType');
      }
      if (dto.size !== undefined && dto.size !== existing.size) {
        data.size = dto.size;
        changedFields.push('size');
      }
      if (
        dto.holdsSpecimens !== undefined &&
        dto.holdsSpecimens !== existing.holds_specimens
      ) {
        data.holds_specimens = dto.holdsSpecimens;
        changedFields.push('holdsSpecimens');
      }
      if (dto.capacity !== undefined && dto.capacity !== existing.capacity) {
        data.capacity = dto.capacity;
        changedFields.push('capacity');
      }

      if (changedFields.length === 0) {
        throw new BadRequestException(
          'At least one storage-unit field must change.',
        );
      }

      data.updated_at = new Date();
      const unit = await transaction.storage_unit.update({
        where: { id },
        data,
      });

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        unitId: id,
        action: 'UPDATE_STORAGE_UNIT',
        details: { fields: changedFields },
      });

      return this.toEntity(unit);
    });
  }

  async move(
    id: string,
    dto: MoveStorageUnitDto,
    movedByAccountId: string,
  ): Promise<StorageUnit> {
    return this.runSerializableMutation(async (transaction) => {
      const unit = await transaction.storage_unit.findUnique({
        where: { id },
      });

      if (!unit) {
        throw new NotFoundException(`Storage unit ${id} not found`);
      }
      this.assertActive(unit);

      if (dto.newParentId === id) {
        throw new BadRequestException(
          'A storage unit cannot be assigned to itself.',
        );
      }

      if (dto.newParentId === unit.parent_id) {
        throw new BadRequestException(
          'The storage unit is already assigned to that parent.',
        );
      }

      if (dto.newParentId) {
        const parent = await transaction.storage_unit.findUnique({
          where: { id: dto.newParentId },
        });
        this.assertUsableParent(parent, dto.newParentId);
        await this.assertNoHierarchyCycle(transaction, id, dto.newParentId);
      }

      const movedAt = new Date();
      const updated = await transaction.storage_unit.update({
        where: { id },
        data: {
          parent_id: dto.newParentId,
          updated_at: movedAt,
        },
      });

      await transaction.storage_movement_history.create({
        data: {
          storage_unit_id: id,
          from_storage_unit_id: unit.parent_id,
          to_storage_unit_id: dto.newParentId,
          moved_by: movedByAccountId,
          reason: dto.reason,
        },
      });

      await this.recordAudit(transaction, {
        userId: movedByAccountId,
        unitId: id,
        action: 'MOVE_STORAGE_UNIT',
        details: {
          fromParentId: unit.parent_id,
          toParentId: dto.newParentId,
          reason: dto.reason ?? null,
        },
      });

      return this.toEntity(updated);
    });
  }

  async archive(
    id: string,
    actingCuratorAccountId: string,
  ): Promise<StorageUnit> {
    return this.runSerializableMutation(async (transaction) => {
      const unit = await transaction.storage_unit.findUnique({
        where: { id },
      });

      if (!unit) {
        throw new NotFoundException(`Storage unit ${id} not found`);
      }

      if (unit.archived_at) {
        return this.toEntity(unit);
      }

      const activeChildren = await transaction.storage_unit.count({
        where: { parent_id: id, archived_at: null },
      });

      if (activeChildren > 0) {
        throw new BadRequestException(
          "Archive or move this storage unit's active children first.",
        );
      }

      const activeLots = await transaction.specimen_lot.count({
        where: { storage_unit_id: id, is_active: true },
      });

      if (activeLots > 0) {
        throw new BadRequestException(
          "Move or deactivate this storage unit's active specimen lots first.",
        );
      }

      const archivedAt = new Date();
      const archived = await transaction.storage_unit.update({
        where: { id },
        data: { archived_at: archivedAt, updated_at: archivedAt },
      });

      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        unitId: id,
        action: 'ARCHIVE_STORAGE_UNIT',
        details: { previousParentId: unit.parent_id },
      });

      return this.toEntity(archived);
    });
  }

  private async findOneOrThrow(
    id: string,
    reader: StorageHierarchyReader = this.prisma,
  ): Promise<storage_unit> {
    const unit = await reader.storage_unit.findUnique({ where: { id } });

    if (!unit) {
      throw new NotFoundException(`Storage unit ${id} not found`);
    }

    return unit;
  }

  private assertUsableParent(
    parent: storage_unit | null,
    parentId: string,
  ): asserts parent is storage_unit {
    if (!parent) {
      throw new NotFoundException(`Storage unit ${parentId} not found`);
    }

    if (parent.archived_at) {
      throw new BadRequestException(
        'An archived storage unit cannot be used as a parent.',
      );
    }
  }

  private assertActive(unit: storage_unit): void {
    if (unit.archived_at) {
      throw new BadRequestException(
        'Archived storage units cannot be changed.',
      );
    }
  }

  private async assertNoHierarchyCycle(
    transaction: StorageHierarchyReader,
    movingUnitId: string,
    candidateParentId: string,
  ): Promise<void> {
    let currentId: string | null = candidateParentId;
    const visited = new Set<string>();

    while (currentId) {
      if (currentId === movingUnitId) {
        throw new BadRequestException(
          'A storage unit cannot be assigned to one of its descendants.',
        );
      }

      if (visited.has(currentId)) {
        throw new BadRequestException(
          'The existing storage hierarchy contains a cycle.',
        );
      }
      visited.add(currentId);

      const current = await transaction.storage_unit.findUnique({
        where: { id: currentId },
      });

      if (!current) {
        throw new NotFoundException(`Storage unit ${currentId} not found`);
      }

      currentId = current.parent_id;
    }
  }

  private async runSerializableMutation<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (!this.isRetryableTransactionError(error)) throw error;
        if (attempt === SERIALIZABLE_RETRY_LIMIT) {
          throw new ConflictException(
            'Storage location changed during the operation. Reload and try again.',
          );
        }
      }
    }

    throw new ConflictException(
      'Storage location changed during the operation. Reload and try again.',
    );
  }

  private isRetryableTransactionError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2034'
    );
  }

  private async recordAudit(
    transaction: Prisma.TransactionClient,
    params: {
      userId: string;
      unitId: string;
      action: string;
      details: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await transaction.audit_log.create({
      data: {
        user_id: params.userId,
        affected_record_id: params.unitId,
        affected_record_type: 'storage_unit',
        action: params.action,
        module: 'storage_locations',
        details: params.details,
        status: 'SUCCESS',
      },
    });
  }

  private toEntity(unit: storage_unit): StorageUnit {
    return {
      id: unit.id,
      parentId: unit.parent_id,
      unitType: unit.unit_type,
      label: unit.label,
      size: unit.size,
      storageType: unit.storage_type,
      holdsSpecimens: unit.holds_specimens,
      capacity: unit.capacity,
      archivedAt: unit.archived_at,
      createdAt: unit.created_at,
      updatedAt: unit.updated_at,
    };
  }

  private toMovementEntity(
    movement: storage_movement_history,
  ): StorageMovement {
    return {
      id: movement.id,
      storageUnitId: movement.storage_unit_id,
      fromStorageUnitId: movement.from_storage_unit_id,
      toStorageUnitId: movement.to_storage_unit_id,
      movedBy: movement.moved_by,
      movedAt: movement.moved_at,
      reason: movement.reason,
    };
  }
}
