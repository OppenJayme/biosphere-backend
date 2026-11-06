import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface RecoveryAttempt {
  attemptId: string;
  snapshotId: string;
  operation: 'capture' | 'restore' | 'verify';
  configurationFingerprint: string;
  workspaceFingerprint: string;
}

export type RecoveryOutcome =
  | { outcome: 'CAPTURED' | 'RESTORED_VERIFIED' | 'VERIFIED' }
  | { outcome: 'FAILED'; code: string };

// Advisory-lock waits consume transaction time too; bound both pool and lock work.
const RECORDING_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 30_000,
};

/** Trusted internal bookkeeping only; does not execute or independently verify recovery. */
@Injectable()
export class RecoveryHistoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async start(input: RecoveryAttempt) {
    input = { ...input };
    const { operator, fingerprint } = this.identity(input);
    return this.prisma.$transaction(async (tx) => {
      // READ COMMITTED takes a fresh snapshot after this per-attempt lock is acquired.
      // Hash collisions only serialize unrelated attempts; identities are still compared.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.attemptId}::text, 0))`;
      const existing = await tx.backup_history.findUnique({
        where: { id: input.attemptId },
      });
      if (existing) {
        await this.requireMatchingStart(tx, input.attemptId, fingerprint);
        return existing;
      }
      const record = await tx.backup_history.create({
        data: {
          id: input.attemptId,
          backup_type: `SYNTHETIC_${input.operation.toUpperCase()}`,
          status: 'IN_PROGRESS',
        },
      });
      await tx.audit_log.create({
        data: {
          affected_record_id: input.attemptId,
          affected_record_type: 'backup_history',
          module: 'backup',
          action: 'recovery_started',
          status: 'SUCCESS',
          details: {
            ...input,
            commandFingerprint: fingerprint,
            scope: 'synthetic',
            operator: {
              kind: 'service',
              id: operator,
            },
          },
        },
      });
      return record;
    }, RECORDING_TRANSACTION_OPTIONS);
  }

  async finish(input: RecoveryAttempt, result: RecoveryOutcome) {
    input = { ...input };
    result = { ...result };
    const { operator, fingerprint } = this.identity(input);
    const expected = {
      capture: 'CAPTURED',
      restore: 'RESTORED_VERIFIED',
      verify: 'VERIFIED',
    };
    if (result?.outcome === 'FAILED') {
      if (
        !this.hasKeys(result, ['outcome', 'code']) ||
        typeof result.code !== 'string' ||
        !/^[A-Z][A-Z0-9_]{0,63}$/.test(result.code)
      ) {
        throw new BadRequestException(
          'A bounded recovery failure code is required.',
        );
      }
    } else if (
      !this.hasKeys(result, ['outcome']) ||
      result.outcome !== expected[input.operation]
    ) {
      throw new BadRequestException(
        'Recovery outcome does not match the operation.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.attemptId}::text, 0))`;
      const existing = await tx.backup_history.findUnique({
        where: { id: input.attemptId },
      });
      if (!existing)
        throw new NotFoundException('Recovery attempt was not started.');
      await this.requireMatchingStart(tx, input.attemptId, fingerprint);
      if (existing.status !== 'IN_PROGRESS') {
        const audit = await tx.audit_log.findFirst({
          where: {
            affected_record_id: input.attemptId,
            affected_record_type: 'backup_history',
            module: 'backup',
            action: 'recovery_finished',
          },
        });
        const details = audit?.details as Prisma.JsonObject | undefined;
        if (
          details?.outcome !== result.outcome ||
          (details?.code ?? null) !==
            (result.outcome === 'FAILED' ? result.code : null)
        ) {
          throw new ConflictException(
            'Recovery outcome is already recorded differently.',
          );
        }
        return existing;
      }
      const record = await tx.backup_history.update({
        where: { id: input.attemptId },
        data: {
          status: result.outcome === 'FAILED' ? 'FAILED' : 'COMPLETED',
          completed_at: new Date(),
        },
      });
      await tx.audit_log.create({
        data: {
          affected_record_id: input.attemptId,
          affected_record_type: 'backup_history',
          module: 'backup',
          action: 'recovery_finished',
          status: result.outcome === 'FAILED' ? 'FAILED' : 'SUCCESS',
          details: {
            ...input,
            ...result,
            scope: 'synthetic',
            commandFingerprint: fingerprint,
            operator: { kind: 'service', id: operator },
          },
        },
      });
      return record;
    }, RECORDING_TRANSACTION_OPTIONS);
  }

  private identity(input: RecoveryAttempt) {
    const operator = this.config.get<string>('RECOVERY_HISTORY_OPERATOR_ID');
    if (
      this.config.get<string>('RECOVERY_HISTORY_RECORDING_ENABLED') !==
        'true' ||
      !operator ||
      !/^[a-z][a-z0-9-]{0,63}$/.test(operator)
    ) {
      throw new ServiceUnavailableException(
        'Synthetic recovery recording is disabled or unconfigured.',
      );
    }
    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    const hash = /^[0-9a-f]{64}$/;
    if (
      !this.hasKeys(input, [
        'attemptId',
        'snapshotId',
        'operation',
        'configurationFingerprint',
        'workspaceFingerprint',
      ]) ||
      ![input.attemptId, input.snapshotId].every(
        (value) => typeof value === 'string' && uuid.test(value),
      ) ||
      !['capture', 'restore', 'verify'].includes(input.operation) ||
      ![input.configurationFingerprint, input.workspaceFingerprint].every(
        (value) => typeof value === 'string' && hash.test(value),
      )
    ) {
      throw new BadRequestException('Invalid synthetic recovery command.');
    }
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify([
          input.attemptId,
          input.snapshotId,
          input.operation,
          input.configurationFingerprint,
          input.workspaceFingerprint,
          operator,
        ]),
      )
      .digest('hex');
    return { operator, fingerprint };
  }

  private hasKeys(value: unknown, keys: string[]): boolean {
    return (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key))
    );
  }

  private async requireMatchingStart(
    tx: Prisma.TransactionClient,
    id: string,
    fingerprint: string,
  ) {
    const audit = await tx.audit_log.findFirst({
      where: {
        affected_record_id: id,
        affected_record_type: 'backup_history',
        module: 'backup',
        action: 'recovery_started',
      },
    });
    if (
      (audit?.details as Prisma.JsonObject | undefined)?.commandFingerprint !==
      fingerprint
    ) {
      throw new ConflictException(
        'Recovery attempt identity is already in use.',
      );
    }
  }
}
