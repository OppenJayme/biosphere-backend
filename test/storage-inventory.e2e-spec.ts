import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';
import { expectAuditReadback } from './support/expect-audit-readback';

describe('Storage inventory (e2e)', () => {
  const curatorToken = 'curator-inventory-token';
  const developerToken = 'developer-inventory-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const developerAuthId = '22222222-2222-4222-8222-222222222222';
  const curatorAccountId = '33333333-3333-4333-8333-333333333333';
  const developerAccountId = '66666666-6666-4666-8666-666666666666';
  const storageId = '44444444-4444-4444-8444-444444444444';
  const missingId = '55555555-5555-4555-8555-555555555555';
  const testDate = new Date('2026-09-01T00:00:00.000Z');

  let app: INestApplication<App>;
  let lotFindMany: jest.Mock;

  beforeEach(async () => {
    // Writes and authorized readback share a fresh database adapter per test.
    const storedAudits: Record<string, unknown>[] = [];
    const storageUnit = {
      id: storageId,
      parent_id: null,
      unit_type: 'CABINET',
      label: 'Cabinet A',
      size: null,
      storage_type: 'DRY_STORAGE',
      holds_specimens: true,
      capacity: 100,
      archived_at: null,
      created_at: testDate,
      updated_at: testDate,
    };
    lotFindMany = jest.fn(() => []);

    const prismaMock = {
      user_account: {
        findUnique: jest.fn(
          ({ where }: { where: { auth_user_id: string } }) => {
            if (where.auth_user_id === curatorAuthId) {
              return {
                id: curatorAccountId,
                role: 'CURATOR',
                status: 'ACTIVE',
              };
            }
            if (where.auth_user_id === developerAuthId) {
              return {
                id: developerAccountId,
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
      },
      storage_unit: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          where.id === storageId ? storageUnit : null,
        ),
        findMany: jest.fn(() => [storageUnit]),
      },
      specimen_lot: {
        findMany: lotFindMany,
        aggregate: jest.fn(() => ({
          _count: { id: 0 },
          _sum: { quantity: null },
        })),
      },
      audit_log: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          const record = {
            ...data,
            id: crypto.randomUUID(),
            created_at: testDate,
            user_account:
              data.user_id === developerAccountId
                ? {
                    id: developerAccountId,
                    full_name: 'Inventory Developer',
                    role: 'DEVELOPER',
                  }
                : null,
          };
          storedAudits.push(record);
          return record;
        }),
        findMany: jest.fn(() => [...storedAudits]),
        count: jest.fn(() => storedAudits.length),
      },
      $transaction: jest.fn((operations: unknown[]) => Promise.all(operations)),
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
            data: { user: { id, email: 'user@example.com' } },
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

  it('rejects requests without an access token', () =>
    request(app.getHttpServer())
      .get(`/storage-locations/${storageId}/inventory`)
      .expect(401));

  it('rejects an active Developer and exposes the denial audit to a Curator', async () => {
    await request(app.getHttpServer())
      .get(`/storage-locations/${storageId}/inventory`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);

    await expectAuditReadback(
      app.getHttpServer(),
      {
        items: [
          {
            id: expect.any(String),
            actor: {
              id: developerAccountId,
              fullName: 'Inventory Developer',
              role: 'DEVELOPER',
            },
            affectedRecordId: developerAccountId,
            affectedRecordType: 'user_account',
            action: 'ACCESS_DENIED',
            module: 'auth',
            result: 'DENIED',
            details: {
              reason: 'ROLE_NOT_PERMITTED',
              role: 'DEVELOPER',
              requiredRoles: ['CURATOR'],
              method: 'GET',
              path: `/storage-locations/${storageId}/inventory`,
            },
            createdAt: testDate.toISOString(),
          },
        ],
        total: 1,
        page: 1,
        limit: 50,
      },
      { token: curatorToken },
    );
  });

  it('returns bounded direct inventory to an active Curator', async () => {
    const response = await request(app.getHttpServer())
      .get(`/storage-locations/${storageId}/inventory?page=2&limit=25`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        storageUnit: expect.objectContaining({ id: storageId }),
        items: [],
        totalLots: 0,
        totalQuantity: 0,
        page: 2,
        limit: 25,
      }),
    );
    expect(lotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 25, take: 25 }),
    );
  });

  it('rejects pagination above the maximum before querying inventory', async () => {
    await request(app.getHttpServer())
      .get(`/storage-locations/${storageId}/inventory?limit=101`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);

    expect(lotFindMany).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown storage unit', () =>
    request(app.getHttpServer())
      .get(`/storage-locations/${missingId}/inventory`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(404));
});
