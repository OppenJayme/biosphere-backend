import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Storage locations (e2e)', () => {
  const curatorToken = 'curator-storage-token';
  const developerToken = 'developer-storage-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const unitId = '44444444-4444-4444-8444-444444444444';
  const oldParentId = '55555555-5555-4555-8555-555555555555';
  const newParentId = '66666666-6666-4666-8666-666666666666';
  const testDate = new Date('2026-01-01T00:00:00.000Z');

  let app: INestApplication<App>;
  let storageUnitDelegate: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    count: jest.Mock;
  };
  let movementDelegate: { create: jest.Mock; findMany: jest.Mock };
  let auditCreate: jest.Mock;

  const storageUnitRecord = (overrides: Record<string, unknown> = {}) => ({
    id: unitId,
    parent_id: null,
    unit_type: 'CABINET',
    label: 'Cabinet A',
    size: null,
    storage_type: 'DRY_STORAGE',
    created_at: testDate,
    updated_at: testDate,
    holds_specimens: false,
    capacity: 100,
    archived_at: null,
    ...overrides,
  });

  beforeEach(async () => {
    storageUnitDelegate = {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        storageUnitRecord(data),
      ),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    };
    movementDelegate = {
      create: jest.fn(),
      findMany: jest.fn(),
    };
    auditCreate = jest.fn();

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
                id: '77777777-7777-4777-8777-777777777777',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }

            return null;
          },
        ),
      },
      storage_unit: storageUnitDelegate,
      storage_movement_history: movementDelegate,
      specimen_lot: { count: jest.fn() },
      audit_log: { create: auditCreate },
      $transaction: jest.fn(
        (
          operation: Promise<unknown>[] | ((transaction: unknown) => unknown),
        ) =>
          Array.isArray(operation)
            ? Promise.all(operation)
            : Promise.resolve(operation(prismaMock)),
      ),
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
              user: {
                id,
                email: 'storage-test@example.com',
                app_metadata: {},
              },
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

  it('creates a database-backed unit and returns camelCase JSON', async () => {
    const response = await request(app.getHttpServer())
      .post('/storage-locations')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        label: 'Cabinet A',
        unitType: 'CABINET',
        storageType: 'DRY_STORAGE',
        capacity: 100,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      id: unitId,
      label: 'Cabinet A',
      unitType: 'CABINET',
      storageType: 'DRY_STORAGE',
      capacity: 100,
    });
    expect(response.body).not.toHaveProperty('storage_type');
    expect(storageUnitDelegate.create).toHaveBeenCalledTimes(1);
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: curatorAccountId,
        affected_record_id: unitId,
        action: 'CREATE_STORAGE_UNIT',
        module: 'storage_locations',
        status: 'SUCCESS',
      }) as Record<string, unknown>,
    });
  });

  it('blocks developers from curator-owned storage routes', () => {
    return request(app.getHttpServer())
      .post('/storage-locations')
      .set('Authorization', `Bearer ${developerToken}`)
      .send({
        label: 'Cabinet A',
        unitType: 'CABINET',
        storageType: 'DRY_STORAGE',
      })
      .expect(403);
  });

  it('protects storage search from unauthenticated users and developers', async () => {
    await request(app.getHttpServer())
      .get('/storage-locations/search')
      .expect(401);

    await request(app.getHttpServer())
      .get('/storage-locations/search')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('returns validated and paginated storage search results to curators', async () => {
    storageUnitDelegate.findMany.mockResolvedValue([
      storageUnitRecord({ holds_specimens: true }),
    ]);
    storageUnitDelegate.count.mockResolvedValue(1);

    const response = await request(app.getHttpServer())
      .get(
        '/storage-locations/search?search=cabinet&unitType=CABINET&storageType=DRY_STORAGE&holdsSpecimens=true&page=2&limit=10',
      )
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toMatchObject({
      items: [
        {
          id: unitId,
          label: 'Cabinet A',
          unitType: 'CABINET',
          storageType: 'DRY_STORAGE',
          holdsSpecimens: true,
        },
      ],
      total: 1,
      page: 2,
      limit: 10,
    });
    expect(storageUnitDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          archived_at: null,
          holds_specimens: true,
        }) as object,
        skip: 10,
        take: 10,
      }) as object,
    );
  });

  it.each(['holdsSpecimens=maybe', 'lifecycle=DELETED', 'page=0', 'limit=101'])(
    'rejects an invalid storage search query: %s',
    async (query) => {
      await request(app.getHttpServer())
        .get(`/storage-locations/search?${query}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);

      expect(storageUnitDelegate.findMany).not.toHaveBeenCalled();
    },
  );

  it('returns the derived root-to-unit hierarchy path to a curator', async () => {
    storageUnitDelegate.findUnique
      .mockResolvedValueOnce(
        storageUnitRecord({ id: unitId, parent_id: oldParentId }),
      )
      .mockResolvedValueOnce(
        storageUnitRecord({
          id: oldParentId,
          parent_id: null,
          label: 'Museum Room',
          unit_type: 'ROOM',
        }),
      );

    const response = await request(app.getHttpServer())
      .get(`/storage-locations/${unitId}/path`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    const responseBody = response.body as Array<{ id: string }>;
    expect(responseBody.map((unit) => unit.id)).toEqual([oldParentId, unitId]);
  });

  it('requires storageType and rejects parent changes through general update', async () => {
    await request(app.getHttpServer())
      .post('/storage-locations')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ label: 'Cabinet A', unitType: 'CABINET' })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/storage-locations/${unitId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ parentId: newParentId })
      .expect(400);
  });

  it('trims text and rejects null for required update fields', async () => {
    storageUnitDelegate.findUnique.mockResolvedValue(storageUnitRecord());
    storageUnitDelegate.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => storageUnitRecord(data),
    );

    const response = await request(app.getHttpServer())
      .patch(`/storage-locations/${unitId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ label: '  Cabinet A1  ' })
      .expect(200);

    expect(response.body.label).toBe('Cabinet A1');
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: curatorAccountId,
        action: 'UPDATE_STORAGE_UNIT',
        details: { fields: ['label'] },
      }) as Record<string, unknown>,
    });

    await request(app.getHttpServer())
      .patch(`/storage-locations/${unitId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ label: null })
      .expect(400);

    await request(app.getHttpServer())
      .patch(`/storage-locations/${unitId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ holdsSpecimens: null })
      .expect(400);
  });

  it('records a move using the authenticated BioSphere account id', async () => {
    storageUnitDelegate.findUnique
      .mockResolvedValueOnce(storageUnitRecord({ parent_id: oldParentId }))
      .mockResolvedValueOnce(storageUnitRecord({ id: newParentId }))
      .mockResolvedValueOnce({ parent_id: null });
    storageUnitDelegate.update.mockResolvedValue(
      storageUnitRecord({ parent_id: newParentId }),
    );
    movementDelegate.create.mockResolvedValue({});

    const response = await request(app.getHttpServer())
      .patch(`/storage-locations/${unitId}/move`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ newParentId, reason: 'Reorganized collection' })
      .expect(200);

    expect(response.body.parentId).toBe(newParentId);
    expect(movementDelegate.create).toHaveBeenCalledWith({
      data: {
        storage_unit_id: unitId,
        from_storage_unit_id: oldParentId,
        to_storage_unit_id: newParentId,
        moved_by: curatorAccountId,
        reason: 'Reorganized collection',
      },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: curatorAccountId,
        affected_record_id: unitId,
        action: 'MOVE_STORAGE_UNIT',
        details: {
          fromParentId: oldParentId,
          toParentId: newParentId,
          reason: 'Reorganized collection',
        },
      }) as Record<string, unknown>,
    });
  });
});
