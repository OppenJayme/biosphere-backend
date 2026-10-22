import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import {
  FAQ_ASSISTANT_NOTICE,
  FAQ_CLARIFY_MESSAGE,
  FAQ_NO_MATCH_MESSAGE,
  FAQ_VISIT_REQUEST_MESSAGE,
  FaqAssistantOutcome,
  FaqAssistantRedirect,
} from './entities/faq-assistant.entity';
import { FaqAssistantService } from './faq-assistant.service';
import { FaqUnansweredService } from './faq-unanswered.service';

const faqDelegate = { findMany: jest.fn() };
const unansweredMock = { record: jest.fn() };
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
        { provide: FaqUnansweredService, useValue: unansweredMock },
      ],
    }).compile();
    service = module.get(FaqAssistantService);
  });

  describe('clarification and unanswered logging (client proposal §7)', () => {
    const PARKING_CARS = {
      id: '33333333-3333-4333-8333-333333333333',
      question: 'Is there parking available for cars?',
      answer: 'Cars may park at the approved campus lot.',
      alternative_wording: [],
      keywords: ['parking'],
      category: 'Visit',
    };
    const PARKING_BUSES = {
      id: '44444444-4444-4444-8444-444444444444',
      question: 'Is there parking available for buses?',
      answer: 'Buses must be arranged with campus security.',
      alternative_wording: [],
      keywords: ['parking'],
      category: 'Visit',
    };

    it('asks the visitor to choose when two approved answers fit equally', async () => {
      faqDelegate.findMany.mockResolvedValue([PARKING_CARS, PARKING_BUSES]);

      const result = await service.ask({
        question: 'Is there parking available?',
      });

      expect(result.outcome).toBe(FaqAssistantOutcome.CLARIFY);
      expect(result.answer).toBeNull();
      expect(result.message).toBe(FAQ_CLARIFY_MESSAGE);
      expect(result.redirect).toBe(FaqAssistantRedirect.GENERAL_INQUIRY);
      expect(result.related.map((item) => item.id).sort()).toEqual(
        [PARKING_CARS.id, PARKING_BUSES.id].sort(),
      );
      expect(unansweredMock.record).toHaveBeenCalledWith(
        'Is there parking available?',
        FaqAssistantOutcome.CLARIFY,
      );
    });

    it('logs an unmatched question for curator review', async () => {
      faqDelegate.findMany.mockResolvedValue([HOURS]);

      await service.ask({ question: 'Do you sell fossils?' });

      expect(unansweredMock.record).toHaveBeenCalledWith(
        'Do you sell fossils?',
        FaqAssistantOutcome.NO_MATCH,
      );
    });

    it('does not log answered questions or visit transactions', async () => {
      faqDelegate.findMany.mockResolvedValue([HOURS]);

      await service.ask({ question: 'what are the museum opening hours' });
      await service.ask({ question: 'Please approve my visit request' });

      expect(unansweredMock.record).not.toHaveBeenCalled();
    });
  });

  it('reads only active knowledge and returns the stored answer', async () => {
    faqDelegate.findMany.mockResolvedValue([HOURS]);

    const result = await service.ask({
      question: 'what are the museum opening hours',
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
