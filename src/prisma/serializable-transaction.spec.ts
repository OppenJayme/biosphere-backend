import { ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { runSerializableTransaction } from './serializable-transaction';

const serializationFailure = () =>
  new Prisma.PrismaClientKnownRequestError('Serialization failure', {
    code: 'P2034',
    clientVersion: '7.10.0',
  });

describe('runSerializableTransaction', () => {
  const transactionMock = jest.fn();
  const prisma = { $transaction: transactionMock } as never;
  const operation = jest.fn();

  beforeEach(() => jest.resetAllMocks());

  it('runs the operation under SERIALIZABLE isolation', async () => {
    transactionMock.mockResolvedValue('done');

    await expect(
      runSerializableTransaction(prisma, operation, 'conflict'),
    ).resolves.toBe('done');
    expect(transactionMock).toHaveBeenCalledWith(operation, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
  });

  it('retries a serialization failure and returns the later result', async () => {
    transactionMock
      .mockRejectedValueOnce(serializationFailure())
      .mockResolvedValueOnce('done');

    await expect(
      runSerializableTransaction(prisma, operation, 'conflict'),
    ).resolves.toBe('done');
    expect(transactionMock).toHaveBeenCalledTimes(2);
  });

  it('reports a 409 after repeated serialization failures', async () => {
    transactionMock.mockRejectedValue(serializationFailure());

    await expect(
      runSerializableTransaction(prisma, operation, 'Reload and try again.'),
    ).rejects.toThrow(new ConflictException('Reload and try again.'));
    expect(transactionMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-serialization errors', async () => {
    const failure = new Error('validation failed');
    transactionMock.mockRejectedValue(failure);

    await expect(
      runSerializableTransaction(prisma, operation, 'conflict'),
    ).rejects.toBe(failure);
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });
});
