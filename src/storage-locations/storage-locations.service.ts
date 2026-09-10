import {
  BadRequestException,
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
import { UpdateStorageUnitDto } from './dto/update-storage-unit.dto';
import { StorageMovement } from './entities/storage-movement.entity';
import { StorageUnit } from './entities/storage-unit.entity';

type StorageHierarchyReader = {
  storage_unit: {
    findUnique(args: { where: { id: string } }): Promise<storage_unit | null>;
  };
};

@Injectable()
export class StorageLocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateStorageUnitDto): Promise<StorageUnit> {
    if (dto.parentId) {
      const parent = await this.prisma.storage_unit.findUnique({
        where: { id: dto.parentId },
      });
      this.assertUsableParent(parent, dto.parentId);
    }

    const unit = await this.prisma.storage_unit.create({
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

    return this.toEntity(unit);
  }

  async findAll(): Promise<StorageUnit[]> {
    const units = await this.prisma.storage_unit.findMany({
      orderBy: [{ label: 'asc' }, { created_at: 'asc' }],
    });

    return units.map((unit) => this.toEntity(unit));
  }

  async findOne(id: string): Promise<StorageUnit> {
    return this.toEntity(await this.findOneOrThrow(id));
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

  async update(id: string, dto: UpdateStorageUnitDto): Promise<StorageUnit> {
    const existing = await this.findOneOrThrow(id);
    this.assertActive(existing);

    const hasChanges = [
      dto.label,
      dto.unitType,
      dto.storageType,
      dto.size,
      dto.holdsSpecimens,
      dto.capacity,
    ].some((value) => value !== undefined);

    if (!hasChanges) {
      throw new BadRequestException('At least one field must be updated.');
    }

    const data: Prisma.storage_unitUncheckedUpdateInput = {
      updated_at: new Date(),
    };

    if (dto.label !== undefined) data.label = dto.label;
    if (dto.unitType !== undefined) data.unit_type = dto.unitType;
    if (dto.storageType !== undefined) data.storage_type = dto.storageType;
    if (dto.size !== undefined) data.size = dto.size;
    if (dto.holdsSpecimens !== undefined) {
      data.holds_specimens = dto.holdsSpecimens;
    }
    if (dto.capacity !== undefined) data.capacity = dto.capacity;

    const unit = await this.prisma.storage_unit.update({
      where: { id },
      data,
    });

    return this.toEntity(unit);
  }

  async move(
    id: string,
    dto: MoveStorageUnitDto,
    movedByAccountId: string,
  ): Promise<StorageUnit> {
    return this.prisma.$transaction(async (transaction) => {
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

      const updated = await transaction.storage_unit.update({
        where: { id },
        data: {
          parent_id: dto.newParentId,
          updated_at: new Date(),
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

      return this.toEntity(updated);
    });
  }

  async archive(id: string): Promise<StorageUnit> {
    return this.prisma.$transaction(async (transaction) => {
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

      return this.toEntity(archived);
    });
  }

  private async findOneOrThrow(id: string): Promise<storage_unit> {
    const unit = await this.prisma.storage_unit.findUnique({ where: { id } });

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
