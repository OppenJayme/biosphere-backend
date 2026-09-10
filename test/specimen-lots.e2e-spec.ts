/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Specimen lots (e2e)', () => {
  const curatorToken = 'curator-lot-token';
  const developerToken = 'developer-lot-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const specimenId = '44444444-4444-4444-8444-444444444444';
  const storageUnitId = '55555555-5555-4555-8555-555555555555';
  const lotId = '66666666-6666-4666-8666-666666666666';
  const transactionId = '77777777-7777-4777-8777-777777777777';
  const testDate = new Date('2026-01-01T00:00:00.000Z');

  let app: INestApplication<App>;
  let lotRecord: Record<string, unknown> | null;
  let specimenRecord: Record<string, unknown>;
  let storageUnitRecord: Record<string, unknown> | null;
  let lotDelegate: {
    aggregate: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  let transactionDelegate: {
    count: jest.Mock;
    create: jest.Mock;
    findMany: jest.Mock;
  };
  let revisionDelegate: { create: jest.Mock };
  let auditDelegate: { create: jest.Mock };

  beforeEach(async () => {
    lotRecord = null;
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
    storageUnitRecord = {
      id: storageUnitId,
      holds_specimens: true,
      archived_at: null,
    };

    lotDelegate = {
      aggregate: jest.fn(() => ({
        _count: { id: lotRecord ? 1 : 0 },
        _sum: { quantity: lotRecord?.quantity ?? null },
      })),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        lotRecord = { id: lotId, ...data };
        return lotRecord;
      }),
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        if (!lotRecord) return null;
        if (where.id && where.id !== lotId) return null;
        if (where.specimen_id && where.specimen_id !== specimenId) return null;
        return lotRecord;
      }),
      findMany: jest.fn(() => (lotRecord ? [lotRecord] : [])),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        lotRecord = { ...lotRecord, ...data };
        return lotRecord;
      }),
    };
    transactionDelegate = {
      count: jest.fn(() => 1),
      create: jest.fn(() => ({
        id: transactionId,
        source_lot_id: null,
        target_lot_id: lotId,
        transaction_type: 'QUANTITY_ADJUSTMENT',
        quantity_affected: 10,
        adjustment_type: 'ADDITION',
        reason: 'Initial inventory count',
        performed_by: curatorAccountId,
        created_at: testDate,
      })),
      findMany: jest.fn(() => [
        {
          id: transactionId,
          source_lot_id: null,
          target_lot_id: lotId,
          transaction_type: 'QUANTITY_ADJUSTMENT',
          quantity_affected: 10,
          adjustment_type: 'ADDITION',
          reason: 'Initial inventory count',
          performed_by: curatorAccountId,
          created_at: testDate,
        },
      ]),
    };
    revisionDelegate = { create: jest.fn(() => ({})) };
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
                id: '88888888-8888-4888-8888-888888888888',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
      },
      specimen: {
        findUnique: jest.fn(() => specimenRecord),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          specimenRecord = { ...specimenRecord, ...data };
          return specimenRecord;
        }),
      },
      storage_unit: { findUnique: jest.fn(() => storageUnitRecord) },
      specimen_lot: lotDelegate,
      specimen_lot_transaction: transactionDelegate,
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
                email: 'lot-test@example.com',
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
      .get(`/specimens/${specimenId}/lots`)
      .expect(401);

    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/lots`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('validates UUIDs, positive integer quantity, condition, and unknown fields', async () => {
    await request(app.getHttpServer())
      .post('/specimens/not-a-uuid/lots')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ storageUnitId, conditionClass: 'GOOD', quantity: 1 })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/lots`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ storageUnitId, conditionClass: 'GOOD', quantity: 0 })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/lots`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ storageUnitId, conditionClass: '   ', quantity: 1 })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/lots`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        storageUnitId,
        conditionClass: ' GOOD ',
        quantity: 1,
        directLocationChange: true,
      })
      .expect(400);

    expect(lotDelegate.create).not.toHaveBeenCalled();
  });

  it('creates a lot and its initial Addition transaction', async () => {
    const response = await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/lots`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        storageUnitId,
        conditionClass: ' GOOD ',
        quantity: 10,
        storageNotes: 'Cabinet inventory count',
        reason: 'Initial inventory count',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: lotId,
        specimenId,
        storageUnitId,
        conditionClass: 'GOOD',
        quantity: 10,
        isActive: true,
        createdBy: curatorAccountId,
      }),
    );
    expect(transactionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        target_lot_id: lotId,
        transaction_type: 'QUANTITY_ADJUSTMENT',
        adjustment_type: 'ADDITION',
        quantity_affected: 10,
        performed_by: curatorAccountId,
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalled();
  });

  it('rejects assignment to a storage unit that cannot hold specimens', async () => {
    storageUnitRecord = {
      id: storageUnitId,
      holds_specimens: false,
      archived_at: null,
    };

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/lots`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ storageUnitId, conditionClass: 'GOOD', quantity: 1 })
      .expect(400);

    expect(lotDelegate.create).not.toHaveBeenCalled();
  });

  it('lists, retrieves, and calculates active lot totals', async () => {
    lotRecord = {
      id: lotId,
      specimen_id: specimenId,
      storage_unit_id: storageUnitId,
      condition_class: 'GOOD',
      quantity: 10,
      storage_notes: null,
      is_active: true,
      created_by: curatorAccountId,
      updated_by: curatorAccountId,
      created_at: testDate,
      updated_at: testDate,
    };

    const listResponse = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/lots`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);
    expect(listResponse.body).toEqual([
      expect.objectContaining({ id: lotId, quantity: 10 }),
    ]);

    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/lots/${lotId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    const summaryResponse = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/lots/summary`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);
    expect(summaryResponse.body).toEqual({
      specimenId,
      activeLotCount: 1,
      totalQuantity: 10,
    });
  });

  it('returns validated, paginated lot transaction history', async () => {
    lotRecord = {
      id: lotId,
      specimen_id: specimenId,
      storage_unit_id: storageUnitId,
      condition_class: 'GOOD',
      quantity: 10,
      storage_notes: null,
      is_active: true,
      created_by: curatorAccountId,
      updated_by: curatorAccountId,
      created_at: testDate,
      updated_at: testDate,
    };

    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/lots/${lotId}/transactions?limit=101`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);

    const response = await request(app.getHttpServer())
      .get(
        `/specimens/${specimenId}/lots/${lotId}/transactions?page=1&limit=25`,
      )
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual({
      items: [
        expect.objectContaining({
          id: transactionId,
          targetLotId: lotId,
          transactionType: 'QUANTITY_ADJUSTMENT',
          adjustmentType: 'ADDITION',
        }),
      ],
      page: 1,
      limit: 25,
      total: 1,
    });
  });

  it('updates only notes and rejects direct quantity edits', async () => {
    lotRecord = {
      id: lotId,
      specimen_id: specimenId,
      storage_unit_id: storageUnitId,
      condition_class: 'GOOD',
      quantity: 10,
      storage_notes: null,
      is_active: true,
      created_by: curatorAccountId,
      updated_by: curatorAccountId,
      created_at: testDate,
      updated_at: testDate,
    };

    await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/lots/${lotId}/notes`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ storageNotes: 'Verified shelf', quantity: 999 })
      .expect(400);

    const response = await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/lots/${lotId}/notes`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ storageNotes: 'Verified shelf' })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: lotId,
        storageNotes: 'Verified shelf',
        quantity: 10,
      }),
    );
    expect(revisionDelegate.create).toHaveBeenCalled();
  });
});
