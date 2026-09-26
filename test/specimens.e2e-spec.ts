import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Specimens (e2e)', () => {
  const curatorToken = 'curator-specimen-token';
  const developerToken = 'developer-specimen-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const specimenId = '44444444-4444-4444-8444-444444444444';
  const collectionId = '55555555-5555-4555-8555-555555555555';
  const revisionId = '77777777-7777-4777-8777-777777777777';
  const testDate = new Date('2026-01-01T00:00:00.000Z');

  let app: INestApplication<App>;
  let specimenRecord: Record<string, unknown>;
  let specimenDelegate: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
  };
  let revisionDelegate: {
    createMany: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  let auditDelegate: { create: jest.Mock };

  beforeEach(async () => {
    specimenRecord = {
      id: specimenId,
      collection_id: collectionId,
      created_by: curatorAccountId,
      updated_by: curatorAccountId,
      archived_by: null,
      accession_number: null,
      specimen_category: 'ZOOLOGY',
      scientific_name: 'Testus specimenus',
      common_name: 'Test specimen',
      gender: 'UNKNOWN',
      classification_status: null,
      status: 'UNCATALOGED',
      public_display_allowed: false,
      remarks: null,
      created_at: testDate,
      updated_at: testDate,
      archived_at: null,
    };

    specimenDelegate = {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        specimenRecord = { ...specimenRecord, ...data };
        return specimenRecord;
      }),
      findMany: jest.fn(() => [specimenRecord]),
      findUnique: jest.fn(() => specimenRecord),
      count: jest.fn(() => 1),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        specimenRecord = { ...specimenRecord, ...data };
        return specimenRecord;
      }),
    };
    revisionDelegate = {
      createMany: jest.fn(() => ({ count: 1 })),
      findMany: jest.fn(() => [
        {
          id: revisionId,
          specimen_id: specimenId,
          changed_by: curatorAccountId,
          field_changed: 'common_name',
          old_value: 'Old name',
          new_value: 'Test specimen',
          reason: 'Identification corrected',
          changed_at: testDate,
          source_section: 'specimen_core',
          user_account: {
            id: curatorAccountId,
            full_name: 'Test Curator',
            role: 'CURATOR',
          },
        },
      ]),
      count: jest.fn(() => 1),
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
                id: '66666666-6666-4666-8666-666666666666',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
      },
      specimen: specimenDelegate,
      collection: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          where.id === collectionId ? { id: collectionId } : null,
        ),
      },
      specimen_lot: { count: jest.fn(() => 0) },
      specimen_revision_history: revisionDelegate,
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
                email: 'specimen-test@example.com',
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

  it('rejects a request without a Supabase access token', () =>
    request(app.getHttpServer()).get('/specimens').expect(401));

  it('rejects an active Developer because specimen routes are curator-only', () =>
    request(app.getHttpServer())
      .get('/specimens')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403));

  it('validates fixed gender values before calling the database', async () => {
    await request(app.getHttpServer())
      .post('/specimens')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ gender: 'UNCONFIRMED' })
      .expect(400);

    expect(specimenDelegate.create).not.toHaveBeenCalled();
  });

  it('creates an Uncataloged specimen using the BioSphere account id', async () => {
    const response = await request(app.getHttpServer())
      .post('/specimens')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        collectionId,
        specimenCategory: 'ZOOLOGY',
        scientificName: 'Testus specimenus',
        commonName: 'Test specimen',
        gender: 'UNKNOWN',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: specimenId,
        collectionId,
        status: 'UNCATALOGED',
        publicDisplay: false,
        createdBy: curatorAccountId,
      }),
    );
    expect(specimenDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        created_by: curatorAccountId,
        updated_by: curatorAccountId,
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalled();
  });

  it('returns duplicate warnings with a created specimen without flagging itself', async () => {
    const response = await request(app.getHttpServer())
      .post('/specimens')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        scientificName: 'Testus specimenus',
        commonName: 'Test specimen',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({ id: specimenId, possibleDuplicates: [] }),
    );
  });

  it('checks unsaved values for possible duplicates without saving', async () => {
    const response = await request(app.getHttpServer())
      .post('/specimens/duplicate-check')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        scientificName: '  testus specimenus ',
        commonName: 'Test specimen',
      })
      .expect(200);

    expect(response.body).toEqual({
      possibleDuplicates: [
        expect.objectContaining({
          specimenId,
          confidence: 'MEDIUM',
          matchedFields: ['SCIENTIFIC_NAME', 'COMMON_NAME'],
        }),
      ],
    });
    expect(specimenDelegate.create).not.toHaveBeenCalled();
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('validates duplicate-check input', () =>
    request(app.getHttpServer())
      .post('/specimens/duplicate-check')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ collectionDate: '05/01/2026' })
      .expect(400));

  it('lists possible duplicates of a saved specimen, excluding itself', async () => {
    const response = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/possible-duplicates`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual({ possibleDuplicates: [] });
  });

  it('returns active specimen records with camelCase API fields', async () => {
    const response = await request(app.getHttpServer())
      .get('/specimens')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: specimenId,
        specimenCategory: 'ZOOLOGY',
        scientificName: 'Testus specimenus',
        publicDisplay: false,
      }),
    ]);
    expect(specimenDelegate.findMany).toHaveBeenCalledWith({
      where: { status: { not: 'ARCHIVED' } },
      orderBy: { created_at: 'desc' },
    });
  });

  it('searches with validated filters and returns a bounded catalog page', async () => {
    const response = await request(app.getHttpServer())
      .get('/specimens/search')
      .query({
        search: '  test specimen  ',
        status: 'UNCATALOGED',
        publicDisplay: 'false',
        page: '2',
        limit: '10',
        sortBy: 'scientificName',
        sortDirection: 'asc',
      })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [expect.objectContaining({ id: specimenId })],
      total: 1,
      page: 2,
      limit: 10,
    });
    expect(specimenDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'UNCATALOGED',
          public_display_allowed: false,
        }),
        orderBy: [
          { scientific_name: { sort: 'asc', nulls: 'last' } },
          { id: 'asc' },
        ],
        skip: 10,
        take: 10,
      }),
    );
  });

  it('rejects invalid catalog query values before accessing specimens', async () => {
    specimenDelegate.findMany.mockClear();

    await request(app.getHttpServer())
      .get('/specimens/search')
      .query({ publicDisplay: 'yes', limit: '101', sortBy: 'remarks' })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);

    expect(specimenDelegate.findMany).not.toHaveBeenCalled();
  });

  it('returns protected, filtered specimen revision history', async () => {
    const response = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .query({
        fieldChanged: '  common_name  ',
        sourceSection: 'specimen_core',
        changedBy: curatorAccountId,
        page: '1',
        limit: '25',
      })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        {
          id: revisionId,
          specimenId,
          changedBy: {
            id: curatorAccountId,
            fullName: 'Test Curator',
            role: 'CURATOR',
          },
          fieldChanged: 'common_name',
          oldValue: 'Old name',
          newValue: 'Test specimen',
          reason: 'Identification corrected',
          sourceSection: 'specimen_core',
          changedAt: testDate.toISOString(),
        },
      ],
      total: 1,
      page: 1,
      limit: 25,
    });
    expect(revisionDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          specimen_id: specimenId,
          changed_by: curatorAccountId,
          field_changed: expect.objectContaining({ equals: 'common_name' }),
          source_section: expect.objectContaining({
            equals: 'specimen_core',
          }),
        }),
        orderBy: [{ changed_at: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 25,
      }),
    );
  });

  it('protects specimen revision history from unauthenticated callers', () =>
    request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .expect(401));

  it('protects specimen revision history from Developer accounts', () =>
    request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403));

  it('rejects invalid revision-history filters before querying history', async () => {
    revisionDelegate.findMany.mockClear();

    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/revisions`)
      .query({ changedBy: 'not-a-uuid', limit: '101' })
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);

    expect(revisionDelegate.findMany).not.toHaveBeenCalled();
  });

  it('updates camelCase API fields and records revision history', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ commonName: 'Updated specimen', remarks: 'Verified' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        commonName: 'Updated specimen',
        remarks: 'Verified',
        updatedBy: curatorAccountId,
      }),
    );
    expect(revisionDelegate.createMany).toHaveBeenCalled();
  });

  it('prevents an Uncataloged specimen from becoming public eligible', () =>
    request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/public-display`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ publicDisplay: true })
      .expect(400));

  it('archives instead of deleting and preserves curator attribution', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/archive`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: 'ARCHIVED',
        publicDisplay: false,
        archivedBy: curatorAccountId,
      }),
    );
    expect(specimenDelegate.update).toHaveBeenCalledWith({
      where: { id: specimenId },
      data: expect.objectContaining({
        status: 'ARCHIVED',
        archived_by: curatorAccountId,
        updated_by: curatorAccountId,
      }),
    });
  });
});
