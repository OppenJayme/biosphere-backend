import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionsService } from './collections.service';
import { ListCollectionsQueryDto } from './dto/list-collections-query.dto';

const collectionDelegate = {
  create: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
};
const auditDelegate = { create: jest.fn() };
const transactionMock = jest.fn();
const prismaMock = {
  collection: collectionDelegate,
  audit_log: auditDelegate,
  $transaction: transactionMock,
};

const COLLECTION_ID = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const TEST_DATE = new Date('2026-01-01T00:00:00.000Z');

function collectionRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: COLLECTION_ID,
    collection_name: 'Zoological Collection',
    created_at: TEST_DATE,
    updated_at: TEST_DATE,
    ...overrides,
  };
}

describe('CollectionsService', () => {
  let service: CollectionsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation((operation: unknown) => {
      if (Array.isArray(operation)) return Promise.all(operation);
      return Promise.resolve(
        (operation as (transaction: typeof prismaMock) => unknown)(prismaMock),
      );
    });
    auditDelegate.create.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollectionsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(CollectionsService);
  });

  it('creates a curator-extensible collection and audits atomically', async () => {
    collectionDelegate.create.mockResolvedValue(collectionRecord());

    await expect(
      service.create({ collectionName: 'Zoological Collection' }, ACCOUNT_ID),
    ).resolves.toEqual({
      id: COLLECTION_ID,
      collectionName: 'Zoological Collection',
      createdAt: TEST_DATE,
      updatedAt: TEST_DATE,
    });
    expect(collectionDelegate.create).toHaveBeenCalledWith({
      data: {
        collection_name: 'Zoological Collection',
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
      },
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: ACCOUNT_ID,
        affected_record_id: COLLECTION_ID,
        affected_record_type: 'collection',
        action: 'CREATE_COLLECTION',
        module: 'specimens',
        status: 'SUCCESS',
      }),
    });
    expect(transactionMock).toHaveBeenCalledTimes(1);
  });

  it('searches and paginates collections in stable name order', async () => {
    collectionDelegate.findMany.mockResolvedValue([collectionRecord()]);
    collectionDelegate.count.mockResolvedValue(1);
    const query = Object.assign(new ListCollectionsQueryDto(), {
      search: 'zoological',
      page: 2,
      limit: 10,
    });

    await expect(service.findAll(query)).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: COLLECTION_ID,
          collectionName: 'Zoological Collection',
        }),
      ],
      total: 1,
      page: 2,
      limit: 10,
    });
    const expectedWhere = {
      collection_name: {
        contains: 'zoological',
        mode: Prisma.QueryMode.insensitive,
      },
    };
    expect(collectionDelegate.findMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: [
        { collection_name: Prisma.SortOrder.asc },
        { id: Prisma.SortOrder.asc },
      ],
      skip: 10,
      take: 10,
    });
    expect(collectionDelegate.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
  });

  it('retrieves one collection by UUID', async () => {
    collectionDelegate.findUnique.mockResolvedValue(collectionRecord());

    await expect(service.findOne(COLLECTION_ID)).resolves.toHaveProperty(
      'collectionName',
      'Zoological Collection',
    );
  });

  it('returns not found for an unknown collection', async () => {
    collectionDelegate.findUnique.mockResolvedValue(null);

    await expect(service.findOne(COLLECTION_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('renames a collection and records the previous and new values', async () => {
    collectionDelegate.findUnique.mockResolvedValue(collectionRecord());
    collectionDelegate.update.mockResolvedValue(
      collectionRecord({
        collection_name: 'Vertebrate Collection',
        updated_at: new Date('2026-01-02T00:00:00.000Z'),
      }),
    );

    await expect(
      service.update(
        COLLECTION_ID,
        { collectionName: 'Vertebrate Collection' },
        ACCOUNT_ID,
      ),
    ).resolves.toHaveProperty('collectionName', 'Vertebrate Collection');
    expect(collectionDelegate.update).toHaveBeenCalledWith({
      where: { id: COLLECTION_ID },
      data: {
        collection_name: 'Vertebrate Collection',
        updated_at: expect.any(Date),
      },
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE_COLLECTION',
        details: {
          previousName: 'Zoological Collection',
          newName: 'Vertebrate Collection',
        },
      }),
    });
  });

  it('rejects a rename that would not change the collection name', async () => {
    collectionDelegate.findUnique.mockResolvedValue(collectionRecord());

    await expect(
      service.update(
        COLLECTION_ID,
        { collectionName: 'Zoological Collection' },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(collectionDelegate.update).not.toHaveBeenCalled();
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('rolls back the collection mutation when audit writing fails', async () => {
    collectionDelegate.create.mockResolvedValue(collectionRecord());
    auditDelegate.create.mockRejectedValue(new Error('audit unavailable'));

    await expect(
      service.create({ collectionName: 'Zoological Collection' }, ACCOUNT_ID),
    ).rejects.toThrow('audit unavailable');
  });
});
