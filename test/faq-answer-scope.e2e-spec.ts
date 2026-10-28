import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createFaqQualityApp } from './support/faq-quality-app';
import {
  syntheticFaqKnowledge,
  type SyntheticFaq,
} from './fixtures/faq-quality-knowledge';

describe('Public FAQ answer scope (DEF-024)', () => {
  let app: INestApplication<App>;
  let knowledge: SyntheticFaq[];

  beforeEach(async () => {
    knowledge = syntheticFaqKnowledge();
    app = await createFaqQualityApp(knowledge);
  });

  afterEach(async () => {
    await app?.close();
  });

  it('declines an explicitly excluded topic instead of answering it', async () => {
    await request(app.getHttpServer())
      .post('/faq/assistant/ask')
      .send({
        question: 'I am not asking about admission fees; where can I park?',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          outcome: 'NO_MATCH',
          answer: null,
          redirect: 'GENERAL_INQUIRY',
          related: [],
        });
      });
  });

  it('does not infer parking inclusion from a fee-only answer', async () => {
    await request(app.getHttpServer())
      .post('/faq/assistant/ask')
      .send({ question: 'Do admission fees include parking?' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          outcome: 'NO_MATCH',
          answer: null,
          redirect: 'GENERAL_INQUIRY',
          related: [],
        });
      });
  });

  it.each([
    "I don't mean admission fees; where can I park?",
    'I am not interested in admission fees; where is parking?',
    'Is parking included in admission fees?',
    'Do admission fees cover coach parking?',
    'Is coach parking covered by admission fees?',
    'What do admission fees include?',
  ])(
    'declines unsupported scope in different wording: %s',
    async (question) => {
      // Even a topical keyword must not invent approval of a relationship.
      knowledge[0].keywords.push('parking');
      await request(app.getHttpServer())
        .post('/faq/assistant/ask')
        .send({ question })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            outcome: 'NO_MATCH',
            answer: null,
            redirect: 'GENERAL_INQUIRY',
            related: [],
          });
        });
    },
  );

  function addInclusionFaq() {
    knowledge.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      question: 'Do admission fees include parking?',
      answer: 'TEST ONLY: Admission does not include parking.',
      alternative_wording: [],
      keywords: ['admission', 'parking'],
      category: 'Fees',
      status: 'ACTIVE',
    });
  }

  it.each([
    'Do admission fees include parking?',
    'Is parking included in admission fees?',
    'Do admission fees cover parking?',
  ])(
    'answers approved inclusion scope without substituting fee-only text: %s',
    async (question) => {
      addInclusionFaq();
      await request(app.getHttpServer())
        .post('/faq/assistant/ask')
        .send({ question })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            outcome: 'ANSWERED',
            answer: {
              id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              answer: 'TEST ONLY: Admission does not include parking.',
            },
            redirect: null,
          });
        });
    },
  );

  it('does not reverse an approved inclusion relationship', async () => {
    addInclusionFaq();
    await request(app.getHttpServer())
      .post('/faq/assistant/ask')
      .send({ question: 'Does parking include admission fees?' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ outcome: 'NO_MATCH', answer: null });
      });
  });

  it('does not assemble relationship evidence across separate approved aliases', async () => {
    addInclusionFaq();
    const entry = knowledge[knowledge.length - 1];
    entry.question = 'Do tour fees include parking?';
    entry.alternative_wording = ['Do admission fees include wheelchair hire?'];
    await request(app.getHttpServer())
      .post('/faq/assistant/ask')
      .send({ question: 'Do admission fees include parking?' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ outcome: 'NO_MATCH', answer: null });
      });
  });

  it('keeps ordinary factual negation answerable', async () => {
    await request(app.getHttpServer())
      .post('/faq/assistant/ask')
      .send({ question: 'Is flash photography not allowed?' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          outcome: 'ANSWERED',
          answer: { id: '55555555-5555-4555-8555-555555555555' },
        });
      });
  });

  it('preserves exact approved wording even when it contains an exclusion', async () => {
    knowledge[0].alternative_wording.push(
      'I am not asking about parking; what is the admission fee?',
    );
    await request(app.getHttpServer())
      .post('/faq/assistant/ask')
      .send({
        question: 'I am not asking about parking; what is the admission fee?',
      })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          outcome: 'ANSWERED',
          answer: { id: '11111111-1111-4111-8111-111111111111' },
        });
      });
  });
});
