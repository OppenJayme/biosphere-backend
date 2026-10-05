import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  FAQ_ASSISTANT_NOTICE,
  FAQ_NO_MATCH_MESSAGE,
  FAQ_VISIT_REQUEST_MESSAGE,
  FaqAssistantOutcome,
  FaqAssistantRedirect,
} from './entities/faq-assistant.entity';
import { FaqAssistantService } from './faq-assistant.service';

const faqDelegate = { findMany: jest.fn() };
const prismaMock = { faq_entry: faqDelegate };

const HOURS = {
  id: '11111111-1111-4111-8111-111111111111',
  question: 'When is the museum open?',
  answer: 'Please refer to the approved visiting hours.',
  alternative_wording: ['What are the opening hours?'],
  keywords: ['hours'],
  category: 'Visit',
};
const VISIT_HOWTO = {
  id: '22222222-2222-4222-8222-222222222222',
  question: 'How do I cancel a visit request?',
  answer: 'Reply to your confirmation email or contact the curator.',
  alternative_wording: [],
  keywords: ['cancel'],
  category: 'Visit',
};

describe('FaqAssistantService', () => {
  let service: FaqAssistantService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FaqAssistantService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(FaqAssistantService);
  });

  it('reads only active knowledge and returns the stored answer', async () => {
    faqDelegate.findMany.mockResolvedValue([HOURS]);

    const result = await service.ask({
      question: 'what time does the museum open',
    });

    expect(faqDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' } }),
    );
    expect(result).toEqual({
      outcome: FaqAssistantOutcome.ANSWERED,
      answer: {
        id: HOURS.id,
        question: HOURS.question,
        answer: HOURS.answer,
        category: 'Visit',
      },
      related: [],
      message: null,
      redirect: null,
      notice: FAQ_ASSISTANT_NOTICE,
    });
  });

  it('falls back to General Inquiry without inventing an answer', async () => {
    faqDelegate.findMany.mockResolvedValue([HOURS]);

    const result = await service.ask({
      question: 'Identify this butterfly species',
    });

    expect(result).toMatchObject({
      outcome: FaqAssistantOutcome.NO_MATCH,
      answer: null,
      message: FAQ_NO_MATCH_MESSAGE,
      redirect: FaqAssistantRedirect.GENERAL_INQUIRY,
    });
  });

  it('redirects unmatched visit-request transactions to the Visit Request form', async () => {
    faqDelegate.findMany.mockResolvedValue([HOURS]);

    const result = await service.ask({
      question: 'Approve my visit request now',
    });

    expect(result).toMatchObject({
      outcome: FaqAssistantOutcome.VISIT_REQUEST_REDIRECT,
      answer: null,
      message: FAQ_VISIT_REQUEST_MESSAGE,
      redirect: FaqAssistantRedirect.VISIT_REQUEST,
    });
  });

  it('answers approved visit how-to knowledge while still pointing to the form', async () => {
    faqDelegate.findMany.mockResolvedValue([HOURS, VISIT_HOWTO]);

    const result = await service.ask({ question: 'Cancel my visit request' });

    expect(result.outcome).toBe(FaqAssistantOutcome.ANSWERED);
    expect(result.answer?.id).toBe(VISIT_HOWTO.id);
    expect(result.redirect).toBe(FaqAssistantRedirect.VISIT_REQUEST);
  });

  it('lists active suggestions without management fields', async () => {
    faqDelegate.findMany.mockResolvedValue([
      { id: HOURS.id, question: HOURS.question, category: HOURS.category },
    ]);

    const result = await service.suggestions({ limit: 4 });

    expect(faqDelegate.findMany).toHaveBeenCalledWith({
      where: { status: 'ACTIVE' },
      select: { id: true, question: true, category: true },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: 4,
    });
    expect(result).toEqual({
      items: [{ id: HOURS.id, question: HOURS.question, category: 'Visit' }],
      notice: FAQ_ASSISTANT_NOTICE,
    });
  });
});
