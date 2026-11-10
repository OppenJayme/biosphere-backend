/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Jest mocks and asymmetric matchers are typed as any. */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditResult } from './entities/audit-log.entity';
import { AuditService } from './audit.service';

const auditDelegate = {
  count: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),
};
const transactionMock = jest.fn();
const prismaMock = {
  audit_log: auditDelegate,
  $transaction: transactionMock,
};

const LOG_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';
const RECORD_ID = '33333333-3333-4333-8333-333333333333';
const TEST_DATE = new Date('2026-01-02T03:04:05.000Z');

function auditRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: LOG_ID,
    user_id: ACTOR_ID,
    affected_record_id: RECORD_ID,
    affected_record_type: 'specimen',
    action: 'UPDATE_SPECIMEN',
    module: 'specimens',
    details: { fields: ['scientific_name'] },
    status: 'SUCCESS',
    created_at: TEST_DATE,
    user_account: {
      id: ACTOR_ID,
      full_name: 'Test Curator',
      role: 'CURATOR',
    },
    ...overrides,
  };
}

describe('AuditService', () => {
  let service: AuditService;

  beforeEach(async () => {
    jest.resetAllMocks();
    auditDelegate.findMany.mockResolvedValue([auditRecord()]);
    auditDelegate.count.mockResolvedValue(1);
    auditDelegate.findUnique.mockResolvedValue(auditRecord());
    transactionMock.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(AuditService);
  });

  it('lists newest-first audit history with actor and camelCase fields', async () => {
    await expect(service.findAll({ page: 1, limit: 50 })).resolves.toEqual({
      items: [
        {
          id: LOG_ID,
          actor: {
            id: ACTOR_ID,
            fullName: 'Test Curator',
            role: 'CURATOR',
          },
          affectedRecordId: RECORD_ID,
          affectedRecordType: 'specimen',
          action: 'UPDATE_SPECIMEN',
          module: 'specimens',
          details: { fields: ['scientific_name'] },
          result: AuditResult.SUCCESS,
          createdAt: TEST_DATE,
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });
    expect(auditDelegate.findMany).toHaveBeenCalledWith({
      where: expect.any(Object),
      include: {
        user_account: {
          select: { id: true, full_name: true, role: true },
        },
      },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      skip: 0,
      take: 50,
    });
  });

  it('builds supported exact filters and inclusive date bounds', async () => {
    await service.findAll({
      result: AuditResult.DENIED,
      module: 'Auth',
      action: 'LOGIN_DENIED',
      actorId: ACTOR_ID,
      affectedRecordType: 'user_account',
      affectedRecordId: RECORD_ID,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-31T23:59:59.999Z',
      page: 2,
      limit: 25,
    });

    expect(auditDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'DENIED',
          module: { equals: 'Auth', mode: Prisma.QueryMode.insensitive },
          action: {
            equals: 'LOGIN_DENIED',
            mode: Prisma.QueryMode.insensitive,
          },
          user_id: ACTOR_ID,
          affected_record_type: {
            equals: 'user_account',
            mode: Prisma.QueryMode.insensitive,
          },
          affected_record_id: RECORD_ID,
          created_at: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lte: new Date('2026-01-31T23:59:59.999Z'),
          },
        },
        skip: 25,
        take: 25,
      }),
    );
  });

  it('searches supported text fields, actor names, and exact UUIDs', async () => {
    await service.findAll({ search: RECORD_ID, page: 1, limit: 20 });

    const call = auditDelegate.findMany.mock.calls[0][0] as {
      where: Prisma.audit_logWhereInput;
    };
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        {
          action: {
            contains: RECORD_ID,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          user_account: {
            is: {
              full_name: {
                contains: RECORD_ID,
                mode: Prisma.QueryMode.insensitive,
              },
            },
          },
        },
        { id: RECORD_ID },
        { user_id: RECORD_ID },
        { affected_record_id: RECORD_ID },
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
    expect(auditDelegate.findMany).not.toHaveBeenCalled();
  });

  it('represents system or unresolved actors as null', async () => {
    auditDelegate.findUnique.mockResolvedValueOnce(
      auditRecord({ user_id: null, user_account: null }),
    );
    await expect(service.findOne(LOG_ID)).resolves.toEqual(
      expect.objectContaining({ actor: null }),
    );
  });

  it('returns not found for an unknown audit identifier', async () => {
    auditDelegate.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne(LOG_ID)).rejects.toThrow(NotFoundException);
  });
});
