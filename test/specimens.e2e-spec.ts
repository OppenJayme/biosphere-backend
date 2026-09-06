/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
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
  const testDate = new Date('2026-01-01T00:00:00.000Z');

  let app: INestApplication<App>;
  let specimenRecord: Record<string, unknown>;
  let specimenDelegate: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  let revisionDelegate: { createMany: jest.Mock };
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
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        specimenRecord = { ...specimenRecord, ...data };
        return specimenRecord;
      }),
    };
    revisionDelegate = { createMany: jest.fn(() => ({ count: 1 })) };
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
      $transaction: jest.fn((callback: (transaction: unknown) => unknown) =>
        Promise.resolve(callback(prismaMock)),
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
