import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { SUPABASE_CLIENT } from './../src/supabase/supabase.constants';
import { TestModule } from './dev-sandbox.module';

describe('Role-based access control (e2e)', () => {
  const curatorToken = 'curator-test-token';
  const developerToken = 'developer-test-token';

  let app: INestApplication<App>;

  beforeEach(async () => {
    const getUser = jest.fn((token: string) => {
      if (token === curatorToken) {
        return {
          data: {
            user: {
              id: 'curator-user-id',
              email: 'curator@example.com',
              app_metadata: { role: 'CURATOR' },
            },
          },
          error: null,
        };
      }

      if (token === developerToken) {
        return {
          data: {
            user: {
              id: 'developer-user-id',
              email: 'developer@example.com',
              app_metadata: { role: 'DEVELOPER' },
            },
          },
          error: null,
        };
      }

      return {
        data: { user: null },
        error: { message: 'Invalid token' },
      };
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TestModule],
    })
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({ auth: { getUser } })
      .compile();

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
