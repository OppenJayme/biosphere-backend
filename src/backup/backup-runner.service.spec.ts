import { gunzipSync } from 'node:zlib';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import { BackupRunnerService, BackupType } from './backup-runner.service';
import { BackupService } from './backup.service';

const historyDelegate = {
  create: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  count: jest.fn(),
  findMany: jest.fn(),
};
const auditDelegate = { create: jest.fn() };
const queryRawMock = jest.fn();
const queryRawUnsafeMock = jest.fn();
const transactionMock = jest.fn();
const prismaMock = {
  backup_history: historyDelegate,
  audit_log: auditDelegate,
  $queryRaw: queryRawMock,
  $queryRawUnsafe: queryRawUnsafeMock,
  $transaction: transactionMock,
};

const bucketApi = { upload: jest.fn(), remove: jest.fn() };
const storageMock = {
  getBucket: jest.fn(),
  createBucket: jest.fn(),
  from: jest.fn(() => bucketApi),
};
const supabaseMock = { storage: storageMock };
const historyServiceMock = { findOne: jest.fn() };

const NOW = new Date('2026-10-22T09:00:00.000Z');
const RUN_ID = '11111111-1111-4111-8111-111111111111';

describe('BackupRunnerService', () => {
  let service: BackupRunnerService;

  beforeEach(async () => {
    jest.resetAllMocks();
    storageMock.from.mockReturnValue(bucketApi);
    transactionMock.mockImplementation((operation: unknown) =>
      Array.isArray(operation)
        ? Promise.all(operation)
        : (operation as (tx: typeof prismaMock) => unknown)(prismaMock),
    );
    historyDelegate.count.mockResolvedValue(0);
    historyDelegate.create.mockResolvedValue({ id: RUN_ID });
    historyDelegate.findMany.mockResolvedValue([]);
    queryRawMock.mockResolvedValue([
      { table_name: 'specimen' },
      { table_name: 'storage_unit' },
    ]);
    queryRawUnsafeMock.mockImplementation((sql: string) =>
      Promise.resolve([
        {
          data: sql.includes('"specimen"') ? [{ id: 's1' }, { id: 's2' }] : [],
        },
      ]),
    );
    storageMock.getBucket.mockResolvedValue({ data: {}, error: null });
    bucketApi.upload.mockResolvedValue({ data: { path: 'x' }, error: null });
    historyServiceMock.findOne.mockResolvedValue({ id: RUN_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupRunnerService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: BackupService, useValue: historyServiceMock },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: SUPABASE_CLIENT, useValue: supabaseMock },
      ],
    }).compile();
    service = module.get(BackupRunnerService);
  });

  it('snapshots every public table, stores it privately, and records the run', async () => {
    await service.run(BackupType.MANUAL, 'account-1', NOW);

    expect(historyDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        backup_type: 'MANUAL',
        created_by: 'account-1',
        status: 'IN_PROGRESS',
      }),
    });
    const [path, body] = bucketApi.upload.mock.calls[0] as [string, Buffer];
    expect(storageMock.from).toHaveBeenCalledWith('system-backups');
    expect(path).toBe(`2026/10/22/${RUN_ID}.json.gz`);
    const snapshot = JSON.parse(gunzipSync(body).toString('utf8')) as {
      tables: Record<string, unknown[]>;
    };
    expect(snapshot.tables).toEqual({
      specimen: [{ id: 's1' }, { id: 's2' }],
      storage_unit: [],
    });
    expect(historyDelegate.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({
        status: 'COMPLETED',
        storage_path: path,
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'RUN_BACKUP',
        status: 'SUCCESS',
        details: { backupType: 'MANUAL', tables: 2, rows: 2 },
      }),
    });
  });

  it('creates the private bucket on first use', async () => {
    storageMock.getBucket.mockResolvedValue({
      data: null,
      error: { message: 'Bucket not found' },
    });
    storageMock.createBucket.mockResolvedValue({ data: {}, error: null });

    await service.run(BackupType.SCHEDULED, null, NOW);

    expect(storageMock.createBucket).toHaveBeenCalledWith('system-backups', {
      public: false,
    });
  });

  it('records a failed run instead of throwing', async () => {
    bucketApi.upload.mockResolvedValue({
      data: null,
      error: { message: 'quota exceeded' },
    });

    await service.run(BackupType.SCHEDULED, null, NOW);

    expect(historyDelegate.update).toHaveBeenCalledWith({
      where: { id: RUN_ID },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'FAILED' }),
    });
  });

  it('refuses to start while another backup is running', async () => {
    historyDelegate.count.mockResolvedValue(1);

    await expect(
      service.run(BackupType.MANUAL, 'account-1', NOW),
    ).rejects.toThrow(ConflictException);
    expect(historyDelegate.create).not.toHaveBeenCalled();
  });

  it('removes artifacts outside retention but keeps their history rows', async () => {
    historyDelegate.findMany.mockResolvedValue([
      { id: 'new', started_at: NOW, storage_path: 'a.json.gz' },
      {
        id: 'old',
        started_at: new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000),
        storage_path: 'b.json.gz',
      },
    ]);
    bucketApi.remove.mockResolvedValue({ error: null });

    await expect(service.pruneExpired(NOW)).resolves.toBe(1);
    expect(bucketApi.remove).toHaveBeenCalledWith(['b.json.gz']);
    expect(historyDelegate.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old'] } },
      data: { storage_path: null },
    });
  });
});
