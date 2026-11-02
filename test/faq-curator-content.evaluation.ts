/** Working quality labels fixed before execution; no live FAQ/database writes. */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { createFaqQualityApp } from './support/faq-quality-app';
import {
  curatorFaqDrafts,
  curatorEvaluationKnowledge,
  CURATOR_FAQ_IDS as ID,
} from './fixtures/faq-curator-knowledge';
import {
  FaqAssistantOutcome,
  type FaqAssistantResponse,
} from '../src/faq/entities/faq-assistant.entity';

type Case = {
  label: string;
  question: string;
  outcomes: string[];
  answerId?: string;
  contextFaqId?: string;
};
// Expected topics come from the human-reviewed fact categories, never scores.
const cases: Case[] = [
  ...curatorFaqDrafts.map((entry) => ({
    label: 'canonical: ' + entry.category + ' / ' + entry.question,
    question: entry.question,
    outcomes: ['ANSWERED'],
    answerId: entry.id,
  })),
  {
    label: 'entrance-fee alternative',
    question: 'What is the entrance fee?',
    outcomes: ['ANSWERED'],
    answerId: ID.admission,
  },
  {
    label: 'alumni entry is distinct from their fee exemption',
    question: 'Do alumni need campus entry?',
    outcomes: ['ANSWERED'],
    answerId: ID.campus,
  },
  {
    label: 'five USC students require an appointment',
    question: 'We are five USC students. Do we need an appointment?',
    outcomes: ['ANSWERED'],
    answerId: ID.appointment,
  },
  {
    label: 'four USC students may visit informally',
    question: 'Can four USC students walk in?',
    outcomes: ['ANSWERED'],
    answerId: ID.appointment,
  },
  {
    label: 'outside-school students do not inherit the student exemption',
    question: 'Are students from other schools exempt from admission fees?',
    outcomes: ['ANSWERED'],
    answerId: ID.admission,
  },
  {
    label: 'larger parties must use separate batches',
    question: 'Can more than 50 visitors join the same tour batch?',
    outcomes: ['ANSWERED'],
    answerId: ID.batch,
  },
  {
    label: 'bounded weekday-to-Saturday follow-up',
    question: 'How about Saturday?',
    contextFaqId: ID.weekday,
    outcomes: ['ANSWERED'],
    answerId: ID.saturday,
  },
  {
    label: 'flash requires the restricted answer',
    question: 'Can I use flash for photos?',
    outcomes: ['ANSWERED'],
    answerId: ID.permission,
  },
  {
    label: 'unsupplied Sunday hours receive no definitive answer',
    question: 'What are Sunday opening hours?',
    outcomes: ['NO_MATCH', 'CLARIFICATION_NEEDED'],
  },
  {
    label: 'parking price is not the PHP 50 admission fee',
    question: 'How much does parking cost?',
    outcomes: ['NO_MATCH'],
  },
  {
    label: 'separate tour charges are not established by admission',
    question: 'Is the guided tour fee included in admission?',
    outcomes: ['NO_MATCH'],
  },
  {
    label: 'vague food and bag restrictions are not activated',
    question: 'May I bring food or bags?',
    outcomes: ['NO_MATCH'],
  },
  {
    label: 'unsupplied contact number is not answered by a role referral',
    question: 'What is the curator phone number?',
    outcomes: ['NO_MATCH'],
  },
  {
    label: 'specimen identification remains unsupported',
    question: 'Can you identify this species?',
    outcomes: ['NO_MATCH'],
  },
  {
    label: 'research access is not specimen borrowing permission',
    question: 'Can I borrow a specimen for research?',
    outcomes: ['NO_MATCH'],
  },
  {
    label: 'unspecified opening hours need weekday/Saturday clarification',
    question: 'What are the opening hours?',
    outcomes: ['CLARIFICATION_NEEDED'],
  },
];

describe('Curator-supplied draft FAQ content through the public HTTP API', () => {
  let app: INestApplication<App>;
  beforeEach(async () => {
    app = await createFaqQualityApp(curatorEvaluationKnowledge());
  });
  afterEach(async () => {
    await app?.close();
  });

  it.each(cases)('$label', async (item) => {
    const response = await request(app.getHttpServer())
      .post('/faq/assistant/ask')
      .send({
        question: item.question,
        ...(item.contextFaqId ? { contextFaqId: item.contextFaqId } : {}),
      })
      .expect(200);
    const body = response.body as FaqAssistantResponse;
    const outcomeMatches = item.outcomes.includes(body.outcome);
    const topicMatches =
      body.outcome !== FaqAssistantOutcome.ANSWERED ||
      body.answer?.id === item.answerId;
    if (!outcomeMatches || !topicMatches)
      console.info('FAQ_CURATOR_MISMATCH', {
        label: item.label,
        expected: item.outcomes,
        expectedAnswer: item.answerId ?? null,
        actual: body.outcome,
        actualAnswer: body.answer?.id ?? null,
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
    expect(body.related.length).toBeLessThanOrEqual(3);
    if (body.outcome === FaqAssistantOutcome.ANSWERED) {
      expect(body.answer?.id).toBe(item.answerId);
      expect(body.answer?.answer).toBe(
        curatorFaqDrafts.find((entry) => entry.id === item.answerId)?.answer,
      );
      expect(Object.keys(body.answer!).sort()).toEqual([
        'answer',
        'category',
        'id',
        'question',
      ]);
    } else expect(body.answer).toBeNull();
    if (body.outcome === FaqAssistantOutcome.CLARIFICATION_NEEDED)
      expect(body.related.length).toBeGreaterThanOrEqual(2);
  });
});
