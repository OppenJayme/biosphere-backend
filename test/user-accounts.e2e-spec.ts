import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('User accounts (e2e)', () => {
  const curatorToken = 'curator-user-accounts-token';
  const developerToken = 'developer-user-accounts-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';

  let app: INestApplication<App>;
  let findMany: jest.Mock;

  beforeEach(async () => {
    findMany = jest.fn(() => [
      {
        id: '22222222-2222-4222-8222-222222222222',
        full_name: 'Maria Santos',
        status: 'ACTIVE',
        created_at: new Date('2026-09-01T00:00:00.000Z'),
        users: {
          email: 'maria@usc.edu.ph',
          email_confirmed_at: new Date('2026-09-01T01:00:00.000Z'),
          last_sign_in_at: new Date('2026-10-01T02:00:00.000Z'),
        },
      },
    ]);
    const prismaMock = {
      user_account: {
        findUnique: jest.fn(
          ({ where }: { where: { auth_user_id?: string } }) => {
            if (where.auth_user_id === curatorAuthId) {
              return {
                id: '22222222-2222-4222-8222-222222222222',
                role: 'CURATOR',
                status: 'ACTIVE',
              };
            }
            if (where.auth_user_id === developerAuthId) {
              return {
                id: '66666666-6666-4666-8666-666666666666',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
        findMany,
      },
      audit_log: { create: jest.fn(() => ({})) },
    };
    const getUser = jest.fn((token: string) => {
      const id =
        token === curatorToken
          ? curatorAuthId
          : token === developerToken
            ? developerAuthId
            : null;
      return id
        ? {
            data: {
              user: { id, email: 'accounts@example.com', app_metadata: {} },
            },
            error: null,
          }
        : { data: { user: null }, error: { message: 'Invalid token' } };
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({ auth: { getUser } })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/user-accounts').expect(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects developers', async () => {
    await request(app.getHttpServer())
      .get('/user-accounts')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns only curator accounts to a curator without caching', async () => {
    const response = await request(app.getHttpServer())
      .get('/user-accounts')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: 'CURATOR' } }),
    );
    expect(response.body).toEqual([
      {
        id: '22222222-2222-4222-8222-222222222222',
        fullName: 'Maria Santos',
        email: 'maria@usc.edu.ph',
        status: 'ACTIVE',
        inviteAccepted: true,
        lastSignInAt: '2026-10-01T02:00:00.000Z',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
  });
});
