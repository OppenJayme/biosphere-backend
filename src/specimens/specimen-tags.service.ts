import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  type specimen,
  type specimen_tag,
  type tag,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttachSpecimenTagDto } from './dto/attach-specimen-tag.dto';
import { ListTagsQueryDto } from './dto/list-tags-query.dto';
import {
  AttachSpecimenTagResult,
  DetachSpecimenTagResult,
  Tag,
} from './entities/tag.entity';

const SERIALIZABLE_RETRY_LIMIT = 3;

type SpecimenTagWithTag = specimen_tag & { tag: tag };

@Injectable()
export class SpecimenTagsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAvailable(query: ListTagsQueryDto): Promise<Tag[]> {
    const tags = await this.prisma.tag.findMany({
      where: query.search
        ? {
            tag_name: {
              contains: query.search,
              mode: Prisma.QueryMode.insensitive,
            },
          }
        : undefined,
      orderBy: [{ tag_name: 'asc' }, { id: 'asc' }],
      take: query.limit,
    });

    return tags.map((item) => this.toEntity(item));
  }

  async findForSpecimen(specimenId: string): Promise<Tag[]> {
    await this.findSpecimenOrThrow(this.prisma, specimenId);
    const tags = await this.prisma.tag.findMany({
      where: { specimen_tag: { some: { specimen_id: specimenId } } },
      orderBy: [{ tag_name: 'asc' }, { id: 'asc' }],
    });

    return tags.map((item) => this.toEntity(item));
  }

  async attach(
    specimenId: string,
    dto: AttachSpecimenTagDto,
    actingCuratorAccountId: string,
  ): Promise<AttachSpecimenTagResult> {
    return this.runSerializableMutation(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertSpecimenEditable(specimenRecord);

      let selectedTag = await transaction.tag.findFirst({
        where: {
          tag_name: {
            equals: dto.tagName,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        orderBy: { id: 'asc' },
      });
      let createdVocabulary = false;

      if (!selectedTag) {
        selectedTag = await transaction.tag.create({
          data: { tag_name: dto.tagName },
        });
        createdVocabulary = true;
      }

      const existingAttachment = await transaction.specimen_tag.findUnique({
        where: {
          specimen_id_tag_id: {
            specimen_id: specimenId,
            tag_id: selectedTag.id,
          },
        },
      });
      if (existingAttachment) {
        return { tag: this.toEntity(selectedTag), attached: false };
      }

      const attachment = await transaction.specimen_tag.create({
        data: { specimen_id: specimenId, tag_id: selectedTag.id },
      });
      const changedAt = new Date();
      await this.touchSpecimen(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changedAt,
      );
      await this.recordRevision(transaction, {
        specimenId,
        changedBy: actingCuratorAccountId,
        oldValue: null,
        newValue: selectedTag.tag_name,
        changedAt,
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        attachmentId: attachment.id,
        specimenId,
        tagId: selectedTag.id,
        action: 'ATTACH_SPECIMEN_TAG',
        details: {
          tagName: selectedTag.tag_name,
          createdVocabulary,
        },
      });

      return { tag: this.toEntity(selectedTag), attached: true };
    });
  }

  async detach(
    specimenId: string,
    tagId: string,
    actingCuratorAccountId: string,
  ): Promise<DetachSpecimenTagResult> {
    return this.runSerializableMutation(async (transaction) => {
      const specimenRecord = await this.findSpecimenOrThrow(
        transaction,
        specimenId,
      );
      this.assertSpecimenEditable(specimenRecord);
      const attachment = await this.findAttachmentOrThrow(
        transaction,
        specimenId,
        tagId,
      );

      await transaction.specimen_tag.delete({
        where: { id: attachment.id },
      });
      const changedAt = new Date();
      await this.touchSpecimen(
        transaction,
        specimenId,
        actingCuratorAccountId,
        changedAt,
      );
      await this.recordRevision(transaction, {
        specimenId,
        changedBy: actingCuratorAccountId,
        oldValue: attachment.tag.tag_name,
        newValue: null,
        changedAt,
      });
      await this.recordAudit(transaction, {
        userId: actingCuratorAccountId,
        attachmentId: attachment.id,
        specimenId,
        tagId,
        action: 'DETACH_SPECIMEN_TAG',
        details: { tagName: attachment.tag.tag_name },
      });

      return { tagId, detached: true };
    });
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
            'Specimen tags changed during the operation. Reload and try again.',
          );
        }
      }
    }

    throw new ConflictException(
      'Specimen tags changed during the operation. Reload and try again.',
    );
  }

  private isRetryableTransactionError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    );
  }

  private async findSpecimenOrThrow(
    client: Pick<Prisma.TransactionClient, 'specimen'>,
    specimenId: string,
  ): Promise<specimen> {
    const item = await client.specimen.findUnique({
      where: { id: specimenId },
    });
    if (!item) {
      throw new NotFoundException(`Specimen ${specimenId} not found`);
    }
    return item;
  }

  private async findAttachmentOrThrow(
    client: Pick<Prisma.TransactionClient, 'specimen_tag'>,
    specimenId: string,
    tagId: string,
  ): Promise<SpecimenTagWithTag> {
    const attachment = await client.specimen_tag.findUnique({
      where: {
        specimen_id_tag_id: {
          specimen_id: specimenId,
          tag_id: tagId,
        },
      },
      include: { tag: true },
    });
    if (!attachment) {
      throw new NotFoundException(
        `Tag ${tagId} is not attached to specimen ${specimenId}`,
      );
    }
    return attachment;
  }

  private assertSpecimenEditable(item: specimen): void {
    if (item.status === 'ARCHIVED' || item.archived_at) {
      throw new BadRequestException(
        'Tags for an archived specimen cannot be changed.',
      );
    }
  }

  private async touchSpecimen(
    transaction: Prisma.TransactionClient,
    specimenId: string,
    actingCuratorAccountId: string,
    changedAt: Date,
  ): Promise<void> {
    await transaction.specimen.update({
      where: { id: specimenId },
      data: {
        updated_by: actingCuratorAccountId,
        updated_at: changedAt,
      },
    });
  }

  private async recordRevision(
    transaction: Prisma.TransactionClient,
    params: {
      specimenId: string;
      changedBy: string;
      oldValue: string | null;
      newValue: string | null;
      changedAt: Date;
    },
  ): Promise<void> {
    await transaction.specimen_revision_history.create({
      data: {
        specimen_id: params.specimenId,
        changed_by: params.changedBy,
        field_changed: 'specimen_tags',
        old_value: params.oldValue,
        new_value: params.newValue,
        changed_at: params.changedAt,
        source_section: 'specimen_tags',
      },
    });
  }

  private async recordAudit(
    transaction: Prisma.TransactionClient,
    params: {
      userId: string;
      attachmentId: string;
      specimenId: string;
      tagId: string;
      action: string;
      details: Record<string, Prisma.InputJsonValue>;
    },
  ): Promise<void> {
    await transaction.audit_log.create({
      data: {
        user_id: params.userId,
        affected_record_id: params.attachmentId,
        affected_record_type: 'specimen_tag',
        action: params.action,
        module: 'specimens',
        details: {
          specimenId: params.specimenId,
          tagId: params.tagId,
          ...params.details,
        },
        status: 'SUCCESS',
      },
    });
  }

  private toEntity(item: tag): Tag {
    return { id: item.id, name: item.tag_name };
  }
}
