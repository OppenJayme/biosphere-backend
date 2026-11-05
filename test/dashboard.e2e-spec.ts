import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Dashboard (e2e)', () => {
  const curatorToken = 'curator-dashboard-token';
  const developerToken = 'developer-dashboard-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';

  let app: INestApplication<App>;

  beforeEach(async () => {
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
      },
      audit_log: { create: jest.fn(() => ({})) },
      specimen: {
        groupBy: jest.fn((args: { by: string[] }) =>
          args.by[0] === 'status'
            ? [{ status: 'CATALOGED', _count: { _all: 2 } }]
            : [],
        ),
        count: jest.fn((args: { where: { OR?: unknown } }) =>
          args.where.OR ? 0 : 1,
        ),
        findMany: jest.fn(() => []),
      },
      inquiry: { count: jest.fn(() => 3) },
      visit_request: { count: jest.fn(() => 1) },
      exhibit: {
        groupBy: jest.fn(() => []),
        count: jest.fn(() => 0),
        findMany: jest.fn(() => []),
      },
      storage_unit: { findMany: jest.fn(() => []) },
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
              user: { id, email: 'dashboard@example.com', app_metadata: {} },
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

  it('is curator-only', async () => {
    await request(app.getHttpServer()).get('/dashboard/summary').expect(401);
    await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('returns the summary without caching', async () => {
    const response = await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toMatchObject({
      specimens: {
        total: 2,
        byStatus: { UNCATALOGED: 0, CATALOGED: 2, ARCHIVED: 0 },
        addedThisMonth: 1,
        possibleDuplicates: 0,
        byCategory: [],
      },
      submissions: { pendingInquiries: 3, pendingVisitRequests: 1 },
      exhibits: { total: 0, live: 0, pending: [] },
      catalogingQueue: [],
      recentSpecimens: [],
    });
    expect(response.body.specimens.addedByMonth).toHaveLength(12);
  });
});
