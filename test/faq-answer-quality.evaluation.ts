/** Opt-in quality evaluation, not a claim of factual museum approval or default CI acceptance. */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createFaqQualityApp } from './support/faq-quality-app';
import {
  syntheticFaqKnowledge,
  type SyntheticFaq,
} from './fixtures/faq-quality-knowledge';
import {
  FaqAssistantOutcome,
  type FaqAssistantResponse,
} from '../src/faq/entities/faq-assistant.entity';

const FEE = '11111111-1111-4111-8111-111111111111';
const WEEKDAY = '22222222-2222-4222-8222-222222222222';
const WEEKEND = '33333333-3333-4333-8333-333333333333';
const PHOTO = '44444444-4444-4444-8444-444444444444';
const FLASH = '55555555-5555-4555-8555-555555555555';
const BOOKING = '66666666-6666-4666-8666-666666666666';
const INACTIVE = '77777777-7777-4777-8777-777777777777';
const UNKNOWN = '99999999-9999-4999-8999-999999999999';

type QualityCase = {
  id: string;
  label: string;
  question: string;
  outcomes: string[];
  answerId?: string;
  choices?: string[];
  contextFaqId?: string;
  selectedFaqId?: string;
  deactivate?: string;
  redirect?: 'GENERAL_INQUIRY' | 'VISIT_REQUEST';
};

/** Human-readable working labels fixed before running the mixed-topic batch; never derived from matcher scores. */
const cases: QualityCase[] = [
  {
    id: 'E02',
    label: 'approved alternative wording',
    question: 'How much is entry?',
    outcomes: ['ANSWERED'],
    answerId: FEE,
  },
  {
    id: 'E03',
    label: 'case punctuation and surrounding whitespace',
    question: '  WHAT IS THE ADMISSION FEE?!  ',
    outcomes: ['ANSWERED'],
    answerId: FEE,
  },
  {
    id: 'E04',
    label: 'short fee paraphrase',
    question: 'admission fee information',
    outcomes: ['ANSWERED'],
    answerId: FEE,
  },
  {
    id: 'E05',
    label: 'weekday alternative wording',
    question: 'When can I visit on weekdays?',
    outcomes: ['ANSWERED'],
    answerId: WEEKDAY,
  },
  {
    id: 'E06',
    label: 'specific weekend hours',
    question: 'What are the weekend opening hours?',
    outcomes: ['ANSWERED'],
    answerId: WEEKEND,
  },
  {
    id: 'E07',
    label: 'unspecified opening hours require a choice',
    question: 'What are the opening hours?',
    outcomes: ['CLARIFICATION_NEEDED'],
    choices: [WEEKDAY, WEEKEND],
  },
  {
    id: 'E08',
    label: 'shared photography alias requires a choice',
    question: 'What photography is permitted?',
    outcomes: ['CLARIFICATION_NEEDED'],
    choices: [PHOTO, FLASH],
  },
  {
    id: 'E09',
    label: 'explicit public choice resolves ambiguity',
    question: 'What photography is permitted?',
    selectedFaqId: PHOTO,
    outcomes: ['ANSWERED'],
    answerId: PHOTO,
  },
  {
    id: 'E10',
    label: 'flash restriction is not general photography permission',
    question: 'Is flash photography allowed?',
    outcomes: ['ANSWERED'],
    answerId: FLASH,
  },
  {
    id: 'E11',
    label: 'flash alternative wording',
    question: 'Can I use flash for photos?',
    outcomes: ['ANSWERED'],
    answerId: FLASH,
  },
  {
    id: 'E12',
    label: 'inactive explicit choice never falls back to another answer',
    question: 'What is the admission fee?',
    selectedFaqId: INACTIVE,
    outcomes: ['NO_MATCH'],
    redirect: 'GENERAL_INQUIRY',
  },
  {
    id: 'E13',
    label: 'unknown context does not authorize a follow-up',
    question: 'How about weekends?',
    contextFaqId: UNKNOWN,
    outcomes: ['NO_MATCH'],
    redirect: 'GENERAL_INQUIRY',
  },
  {
    id: 'E14',
    label: 'supported weekday-to-weekend follow-up',
    question: 'How about weekends?',
    contextFaqId: WEEKDAY,
    outcomes: ['ANSWERED'],
    answerId: WEEKEND,
  },
  {
    id: 'E15',
    label: 'complete new question ignores old topic',
    question: 'What is the admission fee?',
    contextFaqId: WEEKDAY,
    outcomes: ['ANSWERED'],
    answerId: FEE,
  },
  {
    id: 'E16',
    label: 'inactive holiday facts are never answered',
    question: 'What are the holiday opening hours?',
    outcomes: ['NO_MATCH', 'CLARIFICATION_NEEDED'],
  },
  {
    id: 'E17',
    label: 'archived parking facts are never answered',
    question: 'Where can I park?',
    outcomes: ['NO_MATCH'],
    redirect: 'GENERAL_INQUIRY',
  },
  {
    id: 'E18',
    label: 'unrelated weather is unsupported',
    question: 'What is the weather tomorrow?',
    outcomes: ['NO_MATCH'],
    redirect: 'GENERAL_INQUIRY',
  },
  {
    id: 'E19',
    label: 'explicitly rejected fee topic must not answer a parking question',
    question: 'I am not asking about admission fees; where can I park?',
    outcomes: ['NO_MATCH'],
    redirect: 'GENERAL_INQUIRY',
  },
  {
    id: 'E20',
    label: 'fee answer cannot establish whether parking is included',
    question: 'Do admission fees include parking?',
    outcomes: ['NO_MATCH'],
    redirect: 'GENERAL_INQUIRY',
  },
  {
    id: 'E21',
    label: 'approval request gets a referral, never approval',
    question: 'Please approve my visit request',
    outcomes: ['ANSWERED', 'VISIT_REQUEST_REDIRECT'],
    answerId: BOOKING,
    redirect: 'VISIT_REQUEST',
  },
  {
    id: 'E22',
    label: 'campus password reset is unsupported',
    question: 'museum campus password reset',
    outcomes: ['NO_MATCH'],
    redirect: 'GENERAL_INQUIRY',
  },
  {
    id: 'E23',
    label: 'generic museum word is not evidence',
    question: 'museum',
    outcomes: ['NO_MATCH'],
    redirect: 'GENERAL_INQUIRY',
  },
  {
    id: 'E24',
    label: 'unsupported parking follow-up declines',
    question: 'How about parking?',
    contextFaqId: WEEKDAY,
    outcomes: ['NO_MATCH'],
    redirect: 'GENERAL_INQUIRY',
  },
  {
    id: 'E25',
    label: 'deactivated prior topic cannot support follow-up',
    question: 'How about weekends?',
    contextFaqId: WEEKDAY,
    deactivate: WEEKDAY,
    outcomes: ['NO_MATCH'],
    redirect: 'GENERAL_INQUIRY',
  },
];

describe('Synthetic FAQ answer-quality evaluation through public HTTP', () => {
  let app: INestApplication<App>;
  let knowledge: SyntheticFaq[];
  beforeEach(async () => {
    knowledge = syntheticFaqKnowledge();
    app = await createFaqQualityApp(knowledge);
  });
  afterEach(async () => {
    await app?.close();
  });

  it('E01: answers a known fee question with exactly the stored synthetic answer', async () => {
    await request(app.getHttpServer())
      .post('/faq/assistant/ask')
      .send({ question: 'What is the admission fee?' })
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          outcome: 'ANSWERED',
          answer: {
            id: '11111111-1111-4111-8111-111111111111',
            answer: 'TEST ONLY: Admission is five fictional credits.',
          },
          redirect: null,
        });
      });
  });

  it.each(cases)('$id: $label', async (item) => {
    if (item.deactivate)
      knowledge.find((entry) => entry.id === item.deactivate)!.status =
        'INACTIVE';
    const response = await request(app.getHttpServer())
      .post('/faq/assistant/ask')
      .send({
        question: item.question,
        ...(item.contextFaqId ? { contextFaqId: item.contextFaqId } : {}),
        ...(item.selectedFaqId ? { selectedFaqId: item.selectedFaqId } : {}),
      })
      .expect(200);
    const body = response.body as FaqAssistantResponse;
    if (!item.outcomes.includes(body.outcome))
      console.info('FAQ_QUALITY_MISMATCH', {
        case: item.id,
        expectedOutcomes: item.outcomes,
        actualOutcome: body.outcome,
        actualAnswerId: body.answer?.id ?? null,
      });
    expect(item.outcomes).toContain(body.outcome);
    expect(Object.keys(body).sort()).toEqual([
      'answer',
      'message',
      'notice',
      'outcome',
      'redirect',
      'related',
    ]);
    expect(body.notice).toContain('curator-approved museum information');
    expect(body.related.length).toBeLessThanOrEqual(3);
    if (body.outcome === FaqAssistantOutcome.CLARIFICATION_NEEDED)
      expect(body.related.length).toBeGreaterThanOrEqual(2);
    if (body.outcome === FaqAssistantOutcome.ANSWERED) {
      expect(body.answer).not.toBeNull();
      if (!body.answer)
        throw new Error('An ANSWERED response requires a stored answer.');
      expect(body.answer.id).toBe(item.answerId);
      expect(body.answer.answer).toBe(
        knowledge.find((entry) => entry.id === item.answerId)?.answer,
      );
      expect(Object.keys(body.answer).sort()).toEqual([
        'answer',
        'category',
        'id',
        'question',
      ]);
    } else expect(body.answer).toBeNull();
    if (item.choices)
      expect(body.related.map((entry) => entry.id).sort()).toEqual(
        [...item.choices].sort(),
      );
    if (item.redirect) expect(body.redirect).toBe(item.redirect);
    for (const entry of body.related) {
      expect(Object.keys(entry).sort()).toEqual(['category', 'id', 'question']);
      expect(knowledge.find((record) => record.id === entry.id)?.status).toBe(
        'ACTIVE',
      );
    }
  });
});
