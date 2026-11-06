import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { PrismaService } from './prisma.service';

const SERIALIZABLE_RETRY_LIMIT = 3;

/**
 * A conflict raised at COMMIT reaches us as the raw driver adapter error,
 * because Prisma only maps it to P2034 while a query is running.
 */
function isWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034';
  }
  const cause = (error as { cause?: { kind?: unknown } } | null)?.cause;
  return cause?.kind === 'TransactionWriteConflict';
}

/**
 * Runs a read-validate-write operation under SERIALIZABLE isolation, retrying
 * Postgres serialization failures before surfacing a 409.
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
      if (!isWriteConflict(error)) throw error;
    }
  }
  throw new ConflictException(conflictMessage);
}
