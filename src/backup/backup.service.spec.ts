import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BackupService } from './backup.service';
import { BackupStatus } from './entities/backup-history.entity';

const historyDelegate = {
  count: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),
};
const transactionMock = jest.fn();
const prismaMock = {
  backup_history: historyDelegate,
  $transaction: transactionMock,
};

const HISTORY_ID = '11111111-1111-4111-8111-111111111111';
const CREATOR_ID = '22222222-2222-4222-8222-222222222222';
const TEST_DATE = new Date('2026-01-02T03:04:05.000Z');

function historyRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: HISTORY_ID,
    created_by: CREATOR_ID,
    backup_type: 'SCHEDULED_FULL',
    storage_path: 'private/backups/example.dump',
    status: 'COMPLETED',
    started_at: TEST_DATE,
    completed_at: new Date('2026-01-02T03:05:05.000Z'),
    user_account: {
      id: CREATOR_ID,
      full_name: 'Test Curator',
      role: 'CURATOR',
    },
    ...overrides,
  };
}

describe('BackupService', () => {
  let service: BackupService;

  beforeEach(async () => {
    jest.resetAllMocks();
    historyDelegate.findMany.mockResolvedValue([historyRecord()]);
    historyDelegate.count.mockResolvedValue(1);
    historyDelegate.findUnique.mockResolvedValue(historyRecord());
    transactionMock.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(BackupService);
  });

  it('lists newest-first history without exposing an internal storage path', async () => {
    await expect(service.findAll({ page: 1, limit: 50 })).resolves.toEqual({
      items: [
        {
          id: HISTORY_ID,
          creator: {
            id: CREATOR_ID,
            fullName: 'Test Curator',
            role: 'CURATOR',
          },
          backupType: 'SCHEDULED_FULL',
          status: BackupStatus.COMPLETED,
          artifactAvailable: true,
          startedAt: TEST_DATE,
          completedAt: new Date('2026-01-02T03:05:05.000Z'),
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    expect(historyDelegate.findMany).toHaveBeenCalledWith({
      where: expect.any(Object),
      include: {
        user_account: {
          select: { id: true, full_name: true, role: true },
        },
      },
      orderBy: [{ started_at: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 50,
    });
  });

  it('applies approved exact filters and inclusive started-at bounds', async () => {
    await service.findAll({
      status: BackupStatus.FAILED,
      backupType: 'MANUAL_FULL',
      creatorId: CREATOR_ID,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
      page: 2,
      limit: 25,
    });

    expect(historyDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'FAILED',
          backup_type: {
            equals: 'MANUAL_FULL',
            mode: Prisma.QueryMode.insensitive,
          },
          created_by: CREATOR_ID,
          started_at: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-01-31T23:59:59.999Z'),
          },
        },
        skip: 25,
        take: 25,
      }),
    );
  });

  it('searches type, creator name, and exact UUID fields', async () => {
    await service.findAll({ search: HISTORY_ID, page: 1, limit: 20 });

    const call = historyDelegate.findMany.mock.calls[0][0] as {
      where: Prisma.backup_historyWhereInput;
    };
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        {
          backup_type: {
            contains: HISTORY_ID,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          user_account: {
            is: {
              full_name: {
                contains: HISTORY_ID,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          },
        },
        { id: HISTORY_ID },
        { created_by: HISTORY_ID },
      ]),
    );
  });

  it('rejects an inverted timestamp range before querying', async () => {
    await expect(
      service.findAll({
        from: '2026-02-01T00:00:00.000Z',
        to: '2026-01-01T00:00:00.000Z',
        page: 1,
        limit: 50,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(historyDelegate.findMany).not.toHaveBeenCalled();
  });

  it('represents automated backups with no creator as null', async () => {
    historyDelegate.findUnique.mockResolvedValueOnce(
      historyRecord({ created_by: null, user_account: null }),
    );
    await expect(service.findOne(HISTORY_ID)).resolves.toEqual(
      expect.objectContaining({ creator: null }),
    );
  });

  it('returns not found for an unknown backup-history identifier', async () => {
    historyDelegate.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne(HISTORY_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
