import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

// Covers the read-only endpoints added for the planned curator dashboard:
//   - GET /auth/me
//   - GET /storage-locations/occupancy-summary
// The frontend does not consume these yet. Inquiry and visit-request routes
// are covered in public-submissions.e2e-spec.ts.
describe('Dashboard endpoints (e2e)', () => {
  const curatorToken = 'curator-dashboard-token';
  const developerToken = 'developer-dashboard-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const developerAccountId = '44444444-4444-4444-8444-444444444444';
  const roomId = '55555555-5555-4555-8555-555555555555';
  const overCapacityUnitId = '66666666-6666-4666-8666-666666666666';
  const noCapacityUnitId = '77777777-7777-4777-8777-777777777777';
  const testDate = new Date('2026-01-01T00:00:00.000Z');

  let app: INestApplication<App>;

  beforeEach(async () => {
    const accountsByAuthId: Record<
      string,
      { id: string; full_name: string; role: string; status: string }
    > = {
      [curatorAuthId]: {
        id: curatorAccountId,
        full_name: 'Dr. Sarah Reyes',
        role: 'CURATOR',
        status: 'ACTIVE',
      },
      [developerAuthId]: {
        id: developerAccountId,
        full_name: 'Devon Cruz',
        role: 'DEVELOPER',
        status: 'ACTIVE',
      },
    };
    const accountsById = Object.fromEntries(
      Object.values(accountsByAuthId).map((account) => [account.id, account]),
    );

    const storageUnits = [
      {
        id: roomId,
        parent_id: null,
        unit_type: 'ROOM',
        label: 'Herpetology Room 2',
        size: null,
        storage_type: 'DRY_STORAGE',
        holds_specimens: true,
        capacity: 100,
        archived_at: null,
        created_at: testDate,
        updated_at: testDate,
      },
      {
        id: overCapacityUnitId,
        parent_id: null,
        unit_type: 'CABINET',
        label: 'Entomology Cabinet 004',
        size: null,
        storage_type: 'DRY_STORAGE',
        holds_specimens: true,
        capacity: 10,
        archived_at: null,
        created_at: testDate,
        updated_at: testDate,
      },
      {
        id: noCapacityUnitId,
        parent_id: null,
        unit_type: 'CABINET',
        label: 'Uncapacitated Cabinet',
        size: null,
        storage_type: 'DRY_STORAGE',
        holds_specimens: true,
        capacity: null,
        archived_at: null,
        created_at: testDate,
        updated_at: testDate,
      },
    ];

    const lotTotalsByUnit: Record<string, number> = {
      [roomId]: 40,
      [overCapacityUnitId]: 15,
      [noCapacityUnitId]: 3,
    };

    const prismaMock = {
      user_account: {
        findUnique: jest.fn(
          ({ where }: { where: { auth_user_id?: string; id?: string } }) => {
            if (where.auth_user_id)
              return accountsByAuthId[where.auth_user_id] ?? null;
            if (where.id) return accountsById[where.id] ?? null;
            return null;
          },
        ),
      },
      storage_unit: {
        findMany: jest.fn(() => storageUnits),
      },
      specimen_lot: {
        groupBy: jest.fn(() =>
          Object.entries(lotTotalsByUnit).map(
            ([storage_unit_id, quantity]) => ({
              storage_unit_id,
              _sum: { quantity },
            }),
          ),
        ),
      },
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
              user: { id, email: `${id}@example.com`, app_metadata: {} },
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
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /auth/me', () => {
    it('rejects a request with no token', () =>
      request(app.getHttpServer()).get('/auth/me').expect(401));

    it("returns the signed-in curator's profile", async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(response.body).toEqual({
        accountId: curatorAccountId,
        email: `${curatorAuthId}@example.com`,
        fullName: 'Dr. Sarah Reyes',
        role: 'CURATOR',
      });
    });

    it('also resolves a developer profile (route has no @Roles restriction)', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      expect(response.body.fullName).toBe('Devon Cruz');
      expect(response.body.role).toBe('DEVELOPER');
    });
  });

  describe('GET /storage-locations/occupancy-summary', () => {
    it('rejects a request with no token', () =>
      request(app.getHttpServer())
        .get('/storage-locations/occupancy-summary')
        .expect(401));

    it('is curator-only', () =>
      request(app.getHttpServer())
        .get('/storage-locations/occupancy-summary')
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(403));

    it('computes occupied quantity and flags units over capacity', async () => {
      const response = await request(app.getHttpServer())
        .get('/storage-locations/occupancy-summary')
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(response.body).toEqual([
        {
          id: roomId,
          label: 'Herpetology Room 2',
          capacity: 100,
          occupiedQuantity: 40,
          alertCount: 0,
        },
        {
          id: overCapacityUnitId,
          label: 'Entomology Cabinet 004',
          capacity: 10,
          occupiedQuantity: 15,
          alertCount: 1,
        },
        {
          id: noCapacityUnitId,
          label: 'Uncapacitated Cabinet',
          capacity: null,
          occupiedQuantity: 3,
          alertCount: 0,
        },
      ]);
    });
  });
});
