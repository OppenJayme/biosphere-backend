import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { faq_status, Prisma, type faq_entry } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFaqEntryDto } from './dto/create-faq-entry.dto';
import { ListFaqEntriesQueryDto } from './dto/list-faq-entries-query.dto';
import { UpdateFaqEntryDto } from './dto/update-faq-entry.dto';
import { FaqEntry, FaqEntryPage, FaqStatus } from './entities/faq-entry.entity';

const SERIALIZABLE_RETRY_LIMIT = 3;

@Injectable()
export class FaqService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    dto: CreateFaqEntryDto,
    actingCuratorAccountId: string,
  ): Promise<FaqEntry> {
    return this.runSerializableMutation(async (transaction) => {
      const changedAt = new Date();
      const created = await transaction.faq_entry.create({
        data: {
          question: dto.question,
          answer: dto.answer,
          alternative_wording: dto.alternativeWording,
          keywords: dto.keywords,
          category: dto.category,
          status: 'INACTIVE',
          created_by: actingCuratorAccountId,
          updated_by: actingCuratorAccountId,
          created_at: changedAt,
          updated_at: changedAt,
        },
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        entryId: created.id,
        action: 'CREATE_FAQ_ENTRY',
        details: { status: created.status },
      });
      return this.toEntity(created);
    });
  }

  async findAll(query: ListFaqEntriesQueryDto): Promise<FaqEntryPage> {
    const where: Prisma.faq_entryWhereInput = {
      status: query.status,
      category: query.category
        ? { equals: query.category, mode: Prisma.QueryMode.insensitive }
        : undefined,
    };
    const skip = (query.page - 1) * query.limit;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.faq_entry.findMany({
        where,
        orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
        skip,
        take: query.limit,
      }),
      this.prisma.faq_entry.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toEntity(item)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  async findOne(id: string): Promise<FaqEntry> {
    return this.toEntity(await this.findOneOrThrow(this.prisma, id));
  }

  async update(
    id: string,
    dto: UpdateFaqEntryDto,
    actingCuratorAccountId: string,
  ): Promise<FaqEntry> {
    return this.runSerializableMutation(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);
      this.assertEditable(existing);

      const data: Prisma.faq_entryUncheckedUpdateInput = {};
      const changedFields: string[] = [];
      if (dto.question !== undefined && dto.question !== existing.question) {
        data.question = dto.question;
        changedFields.push('question');
      }
      if (dto.answer !== undefined && dto.answer !== existing.answer) {
        data.answer = dto.answer;
        changedFields.push('answer');
      }
      this.addArrayChange(
        data,
        changedFields,
        'alternative_wording',
        dto.alternativeWording,
        existing.alternative_wording,
      );
      this.addArrayChange(
        data,
        changedFields,
        'keywords',
        dto.keywords,
        existing.keywords,
      );
      if (dto.category !== undefined && dto.category !== existing.category) {
        data.category = dto.category;
        changedFields.push('category');
      }

      if (changedFields.length === 0) {
        throw new BadRequestException(
          'At least one FAQ knowledge field must change.',
        );
      }

      const changedAt = new Date();
      data.updated_by = actingCuratorAccountId;
      data.updated_at = changedAt;
      const updated = await transaction.faq_entry.update({
        where: { id },
        data,
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        entryId: id,
        action: 'UPDATE_FAQ_ENTRY',
        details: { fields: changedFields },
      });
      return this.toEntity(updated);
    });
  }

  activate(id: string, actingCuratorAccountId: string): Promise<FaqEntry> {
    return this.changeStatus(
      id,
      faq_status.ACTIVE,
      'ACTIVATE_FAQ_ENTRY',
      actingCuratorAccountId,
    );
  }

  deactivate(id: string, actingCuratorAccountId: string): Promise<FaqEntry> {
    return this.changeStatus(
      id,
      faq_status.INACTIVE,
      'DEACTIVATE_FAQ_ENTRY',
      actingCuratorAccountId,
    );
  }

  archive(id: string, actingCuratorAccountId: string): Promise<FaqEntry> {
    return this.changeStatus(
      id,
      faq_status.ARCHIVED,
      'ARCHIVE_FAQ_ENTRY',
      actingCuratorAccountId,
    );
  }

  private async changeStatus(
    id: string,
    targetStatus: faq_status,
    action: string,
    actingCuratorAccountId: string,
  ): Promise<FaqEntry> {
    return this.runSerializableMutation(async (transaction) => {
      const existing = await this.findOneOrThrow(transaction, id);
      if (existing.status === targetStatus) return this.toEntity(existing);
      if (existing.status === faq_status.ARCHIVED) {
        throw new BadRequestException(
          'Archived FAQ knowledge cannot change status.',
        );
      }

      const changedAt = new Date();
      const updated = await transaction.faq_entry.update({
        where: { id },
        data: {
          status: targetStatus,
          updated_by: actingCuratorAccountId,
          updated_at: changedAt,
        },
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        entryId: id,
        action,
        details: {
          previousStatus: existing.status,
          newStatus: targetStatus,
        },
      });
      return this.toEntity(updated);
    });
  }

  private addArrayChange(
    data: Prisma.faq_entryUncheckedUpdateInput,
    changedFields: string[],
    field: 'alternative_wording' | 'keywords',
    value: string[] | undefined,
    existing: string[],
  ): void {
    if (value !== undefined && !this.sameStringArray(value, existing)) {
      data[field] = value;
      changedFields.push(field);
    }
  }

  private sameStringArray(left: string[], right: string[]): boolean {
    return (
      left.length === right.length &&
      left.every((value, index) => value === right[index])
    );
  }

  private assertEditable(item: faq_entry): void {
    if (item.status === faq_status.ARCHIVED) {
      throw new BadRequestException('Archived FAQ knowledge cannot be edited.');
    }
  }

  private async findOneOrThrow(
    client: Pick<Prisma.TransactionClient, 'faq_entry'>,
    id: string,
  ): Promise<faq_entry> {
    const item = await client.faq_entry.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`FAQ entry ${id} not found`);
    return item;
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
            'FAQ knowledge changed during the operation. Reload and try again.',
          );
        }
      }
    }
    throw new ConflictException(
      'FAQ knowledge changed during the operation. Reload and try again.',
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
      entryId: string;
      action: string;
      details: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await transaction.audit_log.create({
      data: {
        user_id: params.userId,
        affected_record_id: params.entryId,
        affected_record_type: 'faq_entry',
        action: params.action,
        module: 'faq',
        details: params.details,
        status: 'SUCCESS',
      },
    });
  }

  private toEntity(item: faq_entry): FaqEntry {
    return {
      id: item.id,
      question: item.question,
      answer: item.answer,
      alternativeWording: item.alternative_wording,
      keywords: item.keywords,
      category: item.category,
      status: item.status as FaqStatus,
      createdBy: item.created_by,
      updatedBy: item.updated_by,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    };
  }
}
