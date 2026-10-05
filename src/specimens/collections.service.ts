import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type collection } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { runSerializableTransaction } from '../prisma/serializable-transaction';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { ListCollectionsQueryDto } from './dto/list-collections-query.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { CollectionPage, MuseumCollection } from './entities/collection.entity';

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateCollectionDto,
    actingCuratorAccountId: string,
  ): Promise<MuseumCollection> {
    const name = this.validName(dto.collectionName);
    return this.writeCollection(async (transaction) => {
      await this.assertNameAvailable(transaction, name);
      const changedAt = new Date();
      const created = await transaction.collection.create({
        data: {
          collection_name: name,
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

  async update(
    id: string,
    dto: UpdateCollectionDto,
    actingCuratorAccountId: string,
  ): Promise<MuseumCollection> {
    const name = this.validName(dto.collectionName);
    return this.writeCollection(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);
      if (existing.collection_name === name) {
        throw new BadRequestException('The collection name must change.');
      }

      await this.assertNameAvailable(transaction, name, id);

      const updated = await transaction.collection.update({
        where: { id },
        data: {
          collection_name: name,
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

  private validName(value: string): string {
    const name = value.trim();
    if (!name || name.length > 255) {
      throw new BadRequestException(
        'Collection name must contain 1 to 255 characters.',
      );
    }
    return name;
  }

  /** Match the expression index, including legacy names with surrounding spaces. */
  private async assertNameAvailable(
    transaction: Prisma.TransactionClient,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const exclude = excludeId
      ? Prisma.sql`AND id <> ${excludeId}::uuid`
      : Prisma.empty;
    const matches = await transaction.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM public.collection
      WHERE lower(btrim(collection_name)) = lower(btrim(${name}))
      ${exclude}
      LIMIT 1
    `);
    if (matches.length) throw this.nameConflict();
  }

  /** Serializable checks prevent concurrent app writes before index deployment. */
  private async writeCollection(
    operation: (
      transaction: Prisma.TransactionClient,
    ) => Promise<MuseumCollection>,
  ): Promise<MuseumCollection> {
    try {
      return await runSerializableTransaction(
        this.prisma,
        operation,
        'The collection changed during saving. Reload and try again.',
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.nameConflict();
      }
      throw error;
    }
  }

  private nameConflict(): ConflictException {
    return new ConflictException({
      code: 'COLLECTION_NAME_TAKEN',
      message:
        'A collection with this name already exists. Choose a different name.',
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
