import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type collection } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ListCollectionsQueryDto } from './dto/list-collections-query.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { CollectionPage, MuseumCollection } from './entities/collection.entity';

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  create(
    dto: CreateCollectionDto,
    actingCuratorAccountId: string,
  ): Promise<MuseumCollection> {
    return this.prisma.$transaction(async (transaction) => {
      const changedAt = new Date();
      const created = await transaction.collection.create({
        data: {
          collection_name: dto.collectionName,
          created_at: changedAt,
          updated_at: changedAt,
        },
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        collectionId: created.id,
        action: 'CREATE_COLLECTION',
        details: { collectionName: created.collection_name },
      });
      return this.toEntity(created);
    });
  }

  async findAll(query: ListCollectionsQueryDto): Promise<CollectionPage> {
    const where: Prisma.collectionWhereInput = query.search
      ? {
          collection_name: {
            contains: query.search,
            mode: Prisma.QueryMode.insensitive,
          },
        }
      : {};
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.collection.findMany({
        where,
        orderBy: [
          { collection_name: Prisma.SortOrder.asc },
          { id: Prisma.SortOrder.asc },
        ],
        skip,
        take: query.limit,
      }),
      this.prisma.collection.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(id: string): Promise<MuseumCollection> {
    return this.toEntity(await this.findOneOrThrow(this.prisma, id));
  }

  update(
    id: string,
    dto: UpdateCollectionDto,
    actingCuratorAccountId: string,
  ): Promise<MuseumCollection> {
    return this.prisma.$transaction(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);
      if (existing.collection_name === dto.collectionName) {
        throw new BadRequestException('The collection name must change.');
      }

      const updated = await transaction.collection.update({
        where: { id },
        data: {
          collection_name: dto.collectionName,
          updated_at: new Date(),
        },
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        collectionId: id,
        action: 'UPDATE_COLLECTION',
        details: {
          previousName: existing.collection_name,
          newName: updated.collection_name,
        },
      });
      return this.toEntity(updated);
    });
  }

  private async findOneOrThrow(
    client: Pick<Prisma.TransactionClient, 'collection'>,
    id: string,
  ): Promise<collection> {
    const item = await client.collection.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`Collection ${id} not found`);
    return item;
  }

  private async recordAudit(
    transaction: Prisma.TransactionClient,
    params: {
      userId: string;
      collectionId: string;
      action: string;
      details: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await transaction.audit_log.create({
      data: {
        user_id: params.userId,
        affected_record_id: params.collectionId,
        affected_record_type: 'collection',
        action: params.action,
        module: 'specimens',
        details: params.details,
        status: 'SUCCESS',
      },
    });
  }

  private toEntity(item: collection): MuseumCollection {
    return {
      id: item.id,
      collectionName: item.collection_name,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }
}
