import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Collections (e2e)', () => {
  const curatorToken = 'curator-collection-token';
  const developerToken = 'developer-collection-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const collectionId = '44444444-4444-4444-8444-444444444444';
  const testDate = new Date('2026-01-01T00:00:00.000Z');

  let app: INestApplication<App>;
  let collectionRecord: Record<string, unknown>;
  let collectionDelegate: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  let auditDelegate: { create: jest.Mock };

  beforeEach(async () => {
    collectionRecord = {
      id: collectionId,
      collection_name: 'Zoological Collection',
      created_at: testDate,
      updated_at: testDate,
    };
    collectionDelegate = {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        collectionRecord = { ...collectionRecord, ...data };
        return collectionRecord;
      }),
      findMany: jest.fn(() => [collectionRecord]),
      findUnique: jest.fn(() => collectionRecord),
      count: jest.fn(() => 1),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        collectionRecord = { ...collectionRecord, ...data };
        return collectionRecord;
      }),
    };
    auditDelegate = { create: jest.fn(() => ({})) };

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
                id: '55555555-5555-4555-8555-555555555555',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
      },
      collection: collectionDelegate,
      audit_log: auditDelegate,
      $transaction: jest.fn((operation: unknown) => {
        if (Array.isArray(operation)) return Promise.all(operation);
        return Promise.resolve(
          (operation as (transaction: unknown) => unknown)(prismaMock),
        );
      }),
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
                email: 'collection-test@example.com',
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

  it('rejects unauthenticated collection access', () =>
    request(app.getHttpServer()).get('/collections').expect(401));

  it('rejects Developer accounts because collections are curator-managed', () =>
    request(app.getHttpServer())
      .get('/collections')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403));

  it('creates a trimmed collection with curator audit attribution', async () => {
    const response = await request(app.getHttpServer())
      .post('/collections')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ collectionName: '  Zoological Collection  ' })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: collectionId,
        collectionName: 'Zoological Collection',
      }),
    );
    expect(collectionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        collection_name: 'Zoological Collection',
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: curatorAccountId,
        action: 'CREATE_COLLECTION',
      }),
    });
  });

  it('searches collections with bounded pagination', async () => {
    const response = await request(app.getHttpServer())
      .get('/collections')
      .query({ search: '  zoological  ', page: '2', limit: '10' })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        expect.objectContaining({
          id: collectionId,
          collectionName: 'Zoological Collection',
        }),
      ],
      total: 1,
      page: 2,
      limit: 10,
    });
    expect(collectionDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          collection_name: expect.objectContaining({
            contains: 'zoological',
          }),
        },
        skip: 10,
        take: 10,
      }),
    );
  });

  it('retrieves and renames an existing collection', async () => {
    await request(app.getHttpServer())
      .get(`/collections/${collectionId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    const response = await request(app.getHttpServer())
      .patch(`/collections/${collectionId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ collectionName: '  Vertebrate Collection  ' })
      .expect(200);

    expect(response.body.collectionName).toBe('Vertebrate Collection');
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE_COLLECTION',
        details: {
          previousName: 'Zoological Collection',
          newName: 'Vertebrate Collection',
        },
      }),
    });
  });

  it('rejects invalid collection input and pagination', async () => {
    collectionDelegate.create.mockClear();
    collectionDelegate.findMany.mockClear();

    await request(app.getHttpServer())
      .post('/collections')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ collectionName: '   ' })
      .expect(400);
    await request(app.getHttpServer())
      .get('/collections')
      .query({ limit: '101' })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);

    expect(collectionDelegate.create).not.toHaveBeenCalled();
    expect(collectionDelegate.findMany).not.toHaveBeenCalled();
  });

  it('does not expose a collection deletion endpoint', () =>
    request(app.getHttpServer())
      .delete(`/collections/${collectionId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(404));
});
