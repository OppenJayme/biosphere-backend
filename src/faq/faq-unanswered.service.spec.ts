import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  FaqUnansweredService,
  UNANSWERED_RETENTION_DAYS,
} from './faq-unanswered.service';

const unansweredDelegate = {
  create: jest.fn(),
  deleteMany: jest.fn(),
  findUnique: jest.fn(),
  updateMany: jest.fn(),
};
const faqDelegate = { findUnique: jest.fn() };
const transactionMock = jest.fn();
const prismaMock = {
  faq_unanswered_question: unansweredDelegate,
  faq_entry: faqDelegate,
  $transaction: transactionMock,
};

const NOW = new Date('2026-10-22T08:00:00.000Z');
const ROW_ID = '11111111-1111-4111-8111-111111111111';

describe('FaqUnansweredService', () => {
  let service: FaqUnansweredService;

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaqUnansweredService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(FaqUnansweredService);
  });

  it('stores only the question text and prunes rows past the retention window', async () => {
    await service.record('  Do you sell FOSSILS?  ', 'NO_MATCH', NOW);

    expect(unansweredDelegate.create).toHaveBeenCalledWith({
      data: {
        question: 'Do you sell FOSSILS?',
        normalized_question: expect.not.stringMatching(/[A-Z?]/),
        outcome: 'NO_MATCH',
        asked_at: NOW,
      },
    });
    const cutoff = new Date(
      NOW.getTime() - UNANSWERED_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(unansweredDelegate.deleteMany).toHaveBeenCalledWith({
      where: { asked_at: { lt: cutoff } },
    });
  });

  it('never fails the public answer when logging fails', async () => {
    transactionMock.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.record('Anything?', 'NO_MATCH', NOW),
    ).resolves.toBeUndefined();
  });

  it('marks every open ask of the same wording as reviewed', async () => {
    unansweredDelegate.findUnique.mockResolvedValue({
      normalized_question: 'sell fossil',
    });
    faqDelegate.findUnique.mockResolvedValue({ id: 'faq-1' });
    unansweredDelegate.updateMany.mockResolvedValue({ count: 3 });

    await expect(
      service.review(ROW_ID, { faqEntryId: 'faq-1' }, 'account-1'),
    ).resolves.toEqual({ id: ROW_ID, reviewedCount: 3 });
    expect(unansweredDelegate.updateMany).toHaveBeenCalledWith({
      where: { normalized_question: 'sell fossil', reviewed_at: null },
      data: expect.objectContaining({
        reviewed_by: 'account-1',
        faq_entry_id: 'faq-1',
      }),
    });
  });

  it('rejects an unknown row or FAQ entry', async () => {
    unansweredDelegate.findUnique.mockResolvedValue(null);
    await expect(service.review(ROW_ID, {}, 'account-1')).rejects.toThrow(
      NotFoundException,
    );

    unansweredDelegate.findUnique.mockResolvedValue({
      normalized_question: 'sell fossil',
    });
    faqDelegate.findUnique.mockResolvedValue(null);
    await expect(
      service.review(ROW_ID, { faqEntryId: 'missing' }, 'account-1'),
    ).rejects.toThrow(NotFoundException);
    expect(unansweredDelegate.updateMany).not.toHaveBeenCalled();
  });
});
