/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Specimen provenance (e2e)', () => {
  const curatorToken = 'curator-provenance-token';
  const developerToken = 'developer-provenance-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const specimenId = '44444444-4444-4444-8444-444444444444';
  const testDate = new Date('2026-01-01T00:00:00.000Z');

  let app: INestApplication<App>;
  let provenanceRecord: Record<string, unknown> | null;
  let specimenRecord: Record<string, unknown>;
  let provenanceDelegate: {
    create: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  let specimenDelegate: { findUnique: jest.Mock; update: jest.Mock };
  let revisionDelegate: { createMany: jest.Mock };
  let auditDelegate: { create: jest.Mock };

  beforeEach(async () => {
    provenanceRecord = null;
    specimenRecord = {
      id: specimenId,
      collection_id: null,
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

    provenanceDelegate = {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        provenanceRecord = data;
        return provenanceRecord;
      }),
      findUnique: jest.fn(() => provenanceRecord),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        provenanceRecord = { ...provenanceRecord, ...data };
        return provenanceRecord;
      }),
    };
    specimenDelegate = {
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
                id: '55555555-5555-4555-8555-555555555555',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
      },
      specimen: specimenDelegate,
      specimen_provenance: provenanceDelegate,
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
                email: 'provenance-test@example.com',
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

  it('requires an authenticated active Curator', async () => {
    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/provenance`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/provenance`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('validates specimen UUID, text limits, and strict calendar dates', async () => {
    await request(app.getHttpServer())
      .post('/specimens/not-a-uuid/provenance')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ collector: 'Dr. Maria Santos' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/provenance`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ collector: 'A'.repeat(256) })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/provenance`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ collectionDate: '2020-02-30' })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/provenance`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ collectionDate: '2020-05-17T12:00:00Z' })
      .expect(400);

    expect(provenanceDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects an empty provenance payload', async () => {
    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/provenance`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({})
      .expect(400);

    expect(provenanceDelegate.create).not.toHaveBeenCalled();
  });

  it('creates, retrieves, and prevents duplicate provenance', async () => {
    const createResponse = await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/provenance`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        collector: 'Dr. Maria Santos',
        donor: 'USC Alumni',
        collectionDate: '2020-05-17',
        collectionLocation: 'Cebu, Philippines',
        preservationType: 'Wet specimen',
        preservationMethod: '70% ethanol',
      })
      .expect(201);

    expect(createResponse.body).toEqual(
      expect.objectContaining({
        specimenId,
        collector: 'Dr. Maria Santos',
        collectionDate: '2020-05-17',
        collectionLocation: 'Cebu, Philippines',
        preservationMethod: '70% ethanol',
      }),
    );
    expect(specimenDelegate.update).toHaveBeenCalledWith({
      where: { id: specimenId },
      data: {
        updated_by: curatorAccountId,
        updated_at: expect.any(Date),
      },
    });
    expect(revisionDelegate.createMany).toHaveBeenCalled();
    expect(auditDelegate.create).toHaveBeenCalled();

    const getResponse = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/provenance`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(getResponse.body).toEqual(
      expect.objectContaining({ specimenId, collectionDate: '2020-05-17' }),
    );

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/provenance`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ collector: 'Another collector' })
      .expect(409);
  });

  it('updates provenance and clears nullable fields', async () => {
    provenanceRecord = {
      specimen_id: specimenId,
      collector: 'Dr. Maria Santos',
      donor: null,
      collection_date: new Date('2020-05-17T00:00:00.000Z'),
      collection_location: 'Cebu, Philippines',
      preservation_type: 'Wet specimen',
      preservation_method: '70% ethanol',
      updated_at: testDate,
    };

    const response = await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/provenance`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ donor: 'USC Alumni', collectionDate: null })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({ donor: 'USC Alumni', collectionDate: null }),
    );
    expect(provenanceDelegate.update).toHaveBeenCalledWith({
      where: { specimen_id: specimenId },
      data: {
        donor: 'USC Alumni',
        collection_date: null,
        updated_at: expect.any(Date),
      },
    });
  });
});
