import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecimenDto } from '../specimens/dto/create-specimen.dto';
import { SpecimensService } from '../specimens/specimens.service';
import { SyncSpecimenDraftDto } from './dto/sync-specimen-draft.dto';
import { OfflineSpecimenDraftSyncResult } from './entities/offline-specimen-draft-sync-result.entity';

const SERIALIZABLE_RETRY_LIMIT = 3;

@Injectable()
export class OfflineSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly specimens: SpecimensService,
  ) {}

  async syncSpecimenDraft(
    dto: SyncSpecimenDraftDto,
    actingCuratorAccountId: string,
  ): Promise<OfflineSpecimenDraftSyncResult> {
    const payloadFingerprint = this.fingerprint(dto.draft);

    return this.runSerializableMutation(async (transaction) => {
      const existingReceipt = await transaction.offline_draft_sync.findUnique({
        where: {
          created_by_client_draft_id: {
            created_by: actingCuratorAccountId,
            client_draft_id: dto.clientDraftId,
          },
        },
      });

      if (existingReceipt) {
        if (existingReceipt.payload_fingerprint !== payloadFingerprint) {
          throw new ConflictException(
            'This offline draft ID was already synchronized with different content.',
          );
        }

        const specimen = await this.specimens.findOneInTransaction(
          transaction,
          existingReceipt.specimen_id,
        );

        return {
          clientDraftId: dto.clientDraftId,
          alreadySynchronized: true,
          specimen,
        };
      }

      const specimen = await this.specimens.createOfflineDraft(
        transaction,
        dto.draft,
        actingCuratorAccountId,
        dto.clientDraftId,
      );

      await transaction.offline_draft_sync.create({
        data: {
          created_by: actingCuratorAccountId,
          client_draft_id: dto.clientDraftId,
          specimen_id: specimen.id,
          payload_fingerprint: payloadFingerprint,
        },
      });

      return {
        clientDraftId: dto.clientDraftId,
        alreadySynchronized: false,
        specimen,
      };
    });
  }

  private fingerprint(draft: CreateSpecimenDto): string {
    const normalizedDraft = {
      collectionId: draft.collectionId ?? null,
      accessionNumber: draft.accessionNumber ?? null,
      specimenCategory: draft.specimenCategory ?? null,
      scientificName: draft.scientificName ?? null,
      commonName: draft.commonName ?? null,
      gender: draft.gender ?? null,
      classificationStatus: draft.classificationStatus ?? null,
      remarks: draft.remarks ?? null,
    } satisfies Required<CreateSpecimenDto>;

    return createHash('sha256')
      .update(JSON.stringify(normalizedDraft))
      .digest('hex');
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
            'The offline draft changed during synchronization. Retry after refreshing your session.',
          );
        }
      }
    }

    throw new ConflictException(
      'The offline draft changed during synchronization. Retry after refreshing your session.',
    );
  }

  private isRetryableTransactionError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === 'P2002' || error.code === 'P2034')
    );
  }
}
