import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from './prisma.service';

const SERIALIZABLE_RETRY_LIMIT = 3;

/**
 * Runs a read-validate-write operation under SERIALIZABLE isolation, retrying
 * Postgres serialization failures (Prisma P2034) before surfacing a 409.
 */
export async function runSerializableTransaction<T>(
  prisma: Pick<PrismaService, '$transaction'>,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  conflictMessage: string,
): Promise<T> {
  for (let attempt = 1; attempt <= SERIALIZABLE_RETRY_LIMIT; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      const retryable =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034';
      if (!retryable) throw error;
    }
  }
  throw new ConflictException(conflictMessage);
}
