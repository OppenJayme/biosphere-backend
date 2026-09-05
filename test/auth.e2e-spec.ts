import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from './../src/supabase/supabase.constants';
import { TestModule } from './dev-sandbox.module';

describe('Role-based access control (e2e)', () => {
  const curatorToken = 'curator-test-token';
  const developerToken = 'developer-test-token';
  const inactiveToken = 'inactive-test-token';
  const unprovisionedToken = 'unprovisioned-test-token';

  let app: INestApplication<App>;

  beforeEach(async () => {
    const getUser = jest.fn((token: string) => {
      if (
        token === curatorToken ||
        token === developerToken ||
        token === inactiveToken ||
        token === unprovisionedToken
      ) {
        const authUserId = token.replace('-test-token', '-user-id');

        return {
          data: {
            user: {
              id: authUserId,
              email: `${token.replace('-test-token', '')}@example.com`,
              // Deliberately incorrect: authorization must use the role in
              // public.user_account, not potentially stale token metadata.
              app_metadata: { role: 'CURATOR' },
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

    const findUnique = jest.fn(
      ({ where }: { where: { auth_user_id: string } }) => {
        const accounts = {
          'curator-user-id': {
            id: 'curator-account-id',
            role: 'CURATOR',
            status: 'ACTIVE',
          },
          'developer-user-id': {
            id: 'developer-account-id',
            role: 'DEVELOPER',
            status: 'ACTIVE',
          },
          'inactive-user-id': {
            id: 'inactive-account-id',
            role: 'CURATOR',
            status: 'INACTIVE',
          },
        } as const;

        return accounts[where.auth_user_id as keyof typeof accounts] ?? null;
      },
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, TestModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ user_account: { findUnique } })
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

  it('rejects an inactive BioSphere account', () => {
    return request(app.getHttpServer())
      .post('/test/curator-table')
      .set('Authorization', `Bearer ${inactiveToken}`)
      .send({ note: 'e2e test' })
      .expect(403);
  });

  it('rejects a Supabase user without a BioSphere account', () => {
    return request(app.getHttpServer())
      .post('/test/curator-table')
      .set('Authorization', `Bearer ${unprovisionedToken}`)
      .send({ note: 'e2e test' })
      .expect(403);
  });
});
