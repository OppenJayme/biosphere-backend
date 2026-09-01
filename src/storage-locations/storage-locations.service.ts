// src/storage-locations/storage-locations.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CreateStorageUnitDto } from './dto/create-storage-unit.dto';
import { UpdateStorageUnitDto } from './dto/update-storage-unit.dto';
import { StorageUnit } from './entities/storage-unit.entity';

// In-memory placeholder store. Replace with PrismaService once the
// database is provisioned — see docs/backend-architecture.md §3.
@Injectable()
export class StorageLocationsService {
  private readonly units: StorageUnit[] = [];

  create(dto: CreateStorageUnitDto): StorageUnit {
    if (dto.parentId) {
      this.findOne(dto.parentId); // throws 404 if parent doesn't exist
    }
    const unit: StorageUnit = {
      id: randomUUID(),
      holdsSpecimens: false,
      archivedAt: null,
      createdAt: new Date(),
      ...dto,
    };
    this.units.push(unit);
    return unit;
  }

  findAll(): StorageUnit[] {
    return this.units;
  }

  findOne(id: string): StorageUnit {
    const unit = this.units.find((u) => u.id === id);
    if (!unit) throw new NotFoundException(`Storage unit ${id} not found`);
    return unit;
  }

  findChildren(id: string): StorageUnit[] {
    this.findOne(id); // 404 if parent missing
    return this.units.filter((u) => u.parentId === id);
  }

  update(id: string, dto: UpdateStorageUnitDto): StorageUnit {
    const unit = this.findOne(id);
    Object.assign(unit, dto);
    return unit;
  }

  // REQ-4.6-07 / REQ-4.6-12: move a unit to a new parent, preserving its
  // child hierarchy, while rejecting self-parenting and descendant-parenting.
  move(id: string, newParentId: string): StorageUnit {
    const unit = this.findOne(id);

    if (newParentId === id) {
      throw new BadRequestException(
        'A storage unit cannot be assigned to itself.',
      );
    }

    const newParent = this.findOne(newParentId);

    if (this.isDescendant(newParentId, id)) {
      throw new BadRequestException(
        'A storage unit cannot be assigned to one of its own descendants.',
      );
    }

    unit.parentId = newParentId;
    return unit;
  }

  // Walks up from candidateId toward the root; returns true if ancestorId
  // is found along the way (i.e. candidateId lives underneath ancestorId).
  private isDescendant(candidateId: string, ancestorId: string): boolean {
    let current = this.units.find((u) => u.id === candidateId);
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      current = this.units.find((u) => u.id === current!.parentId);
    }
    return false;
  }

  archive(id: string): StorageUnit {
    const unit = this.findOne(id);
    unit.archivedAt = new Date();
    return unit;
  }
}
