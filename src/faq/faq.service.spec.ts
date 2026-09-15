/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FaqStatus } from './entities/faq-entry.entity';
import { FaqService } from './faq.service';

const faqDelegate = {
  count: jest.fn(),
  create: jest.fn(),
  findMany: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};
const auditDelegate = { create: jest.fn() };
const transactionMock = jest.fn();
const prismaMock = {
  faq_entry: faqDelegate,
  audit_log: auditDelegate,
  $transaction: transactionMock,
};

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const ENTRY_ID = '22222222-2222-4222-8222-222222222222';
const TEST_DATE = new Date('2026-01-01T00:00:00.000Z');

function faqRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: ENTRY_ID,
    question: 'When is the museum open?',
    answer: 'Please refer to the approved visiting hours.',
    alternative_wording: ['What are the opening hours?'],
    keywords: ['hours', 'open'],
    category: 'Visit',
    status: 'INACTIVE',
    created_by: ACCOUNT_ID,
    updated_by: ACCOUNT_ID,
    created_at: TEST_DATE,
    updated_at: TEST_DATE,
    ...overrides,
  };
}

describe('FaqService', () => {
  let service: FaqService;

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation(
      (
        input:
          | Array<Promise<unknown>>
          | ((transaction: typeof prismaMock) => unknown),
      ) =>
        Array.isArray(input)
          ? Promise.all(input)
          : Promise.resolve(input(prismaMock)),
    );
    faqDelegate.create.mockResolvedValue(faqRecord());
    faqDelegate.findMany.mockResolvedValue([faqRecord()]);
    faqDelegate.count.mockResolvedValue(1);
    faqDelegate.findUnique.mockResolvedValue(faqRecord());
    faqDelegate.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(faqRecord(data)),
    );
    auditDelegate.create.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [FaqService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = module.get(FaqService);
  });

  it('creates inactive FAQ knowledge with curator attribution and audit', async () => {
    const result = await service.create(
      {
        question: 'When is the museum open?',
        answer: 'Please refer to the approved visiting hours.',
        alternativeWording: ['What are the opening hours?'],
        keywords: ['hours', 'open'],
        category: 'Visit',
      },
      ACCOUNT_ID,
    );

    expect(faqDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: 'INACTIVE',
        created_by: ACCOUNT_ID,
        updated_by: ACCOUNT_ID,
        created_at: expect.any(Date),
        updated_at: expect.any(Date),
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'CREATE_FAQ_ENTRY',
        user_id: ACCOUNT_ID,
        status: 'SUCCESS',
      }),
    });
    expect(result.status).toBe(FaqStatus.INACTIVE);
  });

  it('lists category/status-filtered knowledge with stable pagination', async () => {
    await expect(
      service.findAll({
        status: FaqStatus.ACTIVE,
        category: 'visit',
        page: 2,
        limit: 10,
      }),
    ).resolves.toEqual({
      items: [expect.objectContaining({ id: ENTRY_ID })],
      total: 1,
      page: 2,
      limit: 10,
    });
    const where = {
      status: FaqStatus.ACTIVE,
      category: {
        equals: 'visit',
        mode: Prisma.QueryMode.insensitive,
      },
    };
    expect(faqDelegate.findMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ updated_at: 'desc' }, { id: 'asc' }],
      skip: 10,
      take: 10,
    });
    expect(faqDelegate.count).toHaveBeenCalledWith({ where });
  });

  it('retrieves archived knowledge and reports a missing entry', async () => {
    faqDelegate.findUnique.mockResolvedValueOnce(
      faqRecord({ status: 'ARCHIVED' }),
    );
    await expect(service.findOne(ENTRY_ID)).resolves.toEqual(
      expect.objectContaining({ status: FaqStatus.ARCHIVED }),
    );

    faqDelegate.findUnique.mockResolvedValueOnce(null);
    await expect(service.findOne(ENTRY_ID)).rejects.toThrow(NotFoundException);
  });

  it('updates only changed knowledge and records the changed fields', async () => {
    faqDelegate.update.mockResolvedValueOnce(
      faqRecord({
        answer: 'Updated approved answer.',
        keywords: ['visit'],
        category: null,
      }),
    );

    const result = await service.update(
      ENTRY_ID,
      {
        answer: 'Updated approved answer.',
        keywords: ['visit'],
        category: null,
      },
      ACCOUNT_ID,
    );

    expect(faqDelegate.update).toHaveBeenCalledWith({
      where: { id: ENTRY_ID },
      data: expect.objectContaining({
        answer: 'Updated approved answer.',
        keywords: ['visit'],
        category: null,
        updated_by: ACCOUNT_ID,
        updated_at: expect.any(Date),
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE_FAQ_ENTRY',
        details: {
          fields: ['answer', 'keywords', 'category'],
        },
      }),
    });
    expect(result.category).toBeNull();
  });

  it('rejects an empty or unchanged update', async () => {
    await expect(service.update(ENTRY_ID, {}, ACCOUNT_ID)).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.update(
        ENTRY_ID,
        {
          question: 'When is the museum open?',
          alternativeWording: ['What are the opening hours?'],
        },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(faqDelegate.update).not.toHaveBeenCalled();
  });

  it('rejects edits to archived knowledge', async () => {
    faqDelegate.findUnique.mockResolvedValueOnce(
      faqRecord({ status: 'ARCHIVED' }),
    );
    await expect(
      service.update(ENTRY_ID, { answer: 'Changed' }, ACCOUNT_ID),
    ).rejects.toThrow(BadRequestException);
    expect(faqDelegate.update).not.toHaveBeenCalled();
  });

  it.each([
    ['activate', 'ACTIVE', 'ACTIVATE_FAQ_ENTRY'],
    ['deactivate', 'INACTIVE', 'DEACTIVATE_FAQ_ENTRY'],
    ['archive', 'ARCHIVED', 'ARCHIVE_FAQ_ENTRY'],
  ] as const)(
    '%s changes lifecycle state with explicit audit semantics',
    async (operation, targetStatus, action) => {
      if (operation === 'deactivate') {
        faqDelegate.findUnique.mockResolvedValueOnce(
          faqRecord({ status: 'ACTIVE' }),
        );
      }
      faqDelegate.update.mockResolvedValueOnce(
        faqRecord({ status: targetStatus }),
      );

      const result = await service[operation](ENTRY_ID, ACCOUNT_ID);

      expect(faqDelegate.update).toHaveBeenCalledWith({
        where: { id: ENTRY_ID },
        data: expect.objectContaining({
          status: targetStatus,
          updated_by: ACCOUNT_ID,
        }),
      });
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action }),
      });
      expect(result.status).toBe(targetStatus);
    },
  );

  it('makes repeated lifecycle commands idempotent', async () => {
    faqDelegate.findUnique.mockResolvedValueOnce(
      faqRecord({ status: 'ACTIVE' }),
    );
    await expect(service.activate(ENTRY_ID, ACCOUNT_ID)).resolves.toEqual(
      expect.objectContaining({ status: FaqStatus.ACTIVE }),
    );
    expect(faqDelegate.update).not.toHaveBeenCalled();
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('prevents archived knowledge from returning to matching eligibility', async () => {
    faqDelegate.findUnique.mockResolvedValueOnce(
      faqRecord({ status: 'ARCHIVED' }),
    );
    await expect(service.activate(ENTRY_ID, ACCOUNT_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(faqDelegate.update).not.toHaveBeenCalled();
  });

  it('returns a recoverable conflict after repeated concurrent changes', async () => {
    transactionMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Write conflict', {
        code: 'P2034',
        clientVersion: '7.10.0',
      }),
    );
    await expect(service.activate(ENTRY_ID, ACCOUNT_ID)).rejects.toThrow(
      ConflictException,
    );
    expect(transactionMock).toHaveBeenCalledTimes(3);
  });
});
