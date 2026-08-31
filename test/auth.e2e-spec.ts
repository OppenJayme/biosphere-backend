import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClient } from '@supabase/supabase-js';
import { AppModule } from './../src/app.module';
import * as dotenv from 'dotenv';
dotenv.config();

describe('Role-based access control (e2e)', () => {
  let app: INestApplication<App>;
  let curatorToken: string;
  let developerToken: string;

  beforeAll(async () => {
    // Separate client using the ANON key — this is a real user login,
    // not an admin action, so service-role is not appropriate here.
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    );

    const curatorLogin = await supabase.auth.signInWithPassword({
      email: process.env.TEST_CURATOR_EMAIL!,
      password: process.env.TEST_CURATOR_PASSWORD!,
    });
    curatorToken = curatorLogin.data.session?.access_token ?? '';

    const developerLogin = await supabase.auth.signInWithPassword({
      email: process.env.TEST_DEVELOPER_EMAIL!,
      password: process.env.TEST_DEVELOPER_PASSWORD!,
    });
    developerToken = developerLogin.data.session?.access_token ?? '';

    if (!curatorToken || !developerToken) {
      throw new Error(
        'Failed to obtain test tokens — check that TEST_CURATOR_* / TEST_DEVELOPER_* accounts exist in Supabase',
      );
    }
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('developer-table', () => {
    it('allows a developer', () => {
      return request(app.getHttpServer())
        .post('/test/developer-table')
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ note: 'e2e test' })
        .expect(201);
    });

    it('blocks a curator', () => {
      return request(app.getHttpServer())
        .post('/test/developer-table')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ note: 'e2e test' })
        .expect(403);
    });
  });

  describe('curator-table', () => {
    it('allows a curator', () => {
      return request(app.getHttpServer())
        .post('/test/curator-table')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ note: 'e2e test' })
        .expect(201);
    });

    it('blocks a developer', () => {
      return request(app.getHttpServer())
        .post('/test/curator-table')
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ note: 'e2e test' })
        .expect(403);
    });
  });

  it('rejects requests with no token at all', () => {
    return request(app.getHttpServer())
      .post('/test/curator-table')
      .send({ note: 'e2e test' })
      .expect(401);
  });
});