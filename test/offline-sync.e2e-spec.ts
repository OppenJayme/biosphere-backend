import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Offline specimen draft synchronization (e2e)', () => {
  const curatorToken = 'curator-offline-sync-token';
  const developerToken = 'developer-offline-sync-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const draftId = '44444444-4444-4444-8444-444444444444';
  const specimenId = '55555555-5555-4555-8555-555555555555';
  const testDate = new Date('2026-01-01T00:00:00.000Z');

  let app: INestApplication<App>;
  let receiptFindUnique: jest.Mock;
  let receiptCreate: jest.Mock;
  let specimenCreate: jest.Mock;
  let auditCreate: jest.Mock;

  beforeEach(async () => {
    const specimenRecord = (overrides: Record<string, unknown> = {}) => ({
      id: specimenId,
      collection_id: null,
      created_by: curatorAccountId,
      updated_by: curatorAccountId,
      archived_by: null,
      accession_number: null,
      specimen_category: 'ZOOLOGY',
      scientific_name: 'Testus specimenus',
      common_name: null,
      gender: null,
      classification_status: null,
      status: 'UNCATALOGED',
      public_display_allowed: false,
      remarks: null,
      created_at: testDate,
      updated_at: testDate,
      archived_at: null,
      ...overrides,
    });

    receiptFindUnique = jest.fn(() => null);
    receiptCreate = jest.fn(() => ({}));
    specimenCreate = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      specimenRecord(data),
    );
    auditCreate = jest.fn(() => ({}));

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
      offline_draft_sync: {
        findUnique: receiptFindUnique,
        create: receiptCreate,
      },
      specimen: {
        create: specimenCreate,
        findUnique: jest.fn(() => specimenRecord()),
      },
      collection: { findUnique: jest.fn() },
      audit_log: { create: auditCreate },
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
                email: 'offline-sync@example.com',
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

  it('synchronizes trimmed text as one Uncataloged specimen with attribution', async () => {
    const response = await request(app.getHttpServer())
      .post('/offline-sync/specimen-drafts')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        clientDraftId: draftId,
        draft: {
          specimenCategory: '  ZOOLOGY  ',
          scientificName: '  Testus specimenus  ',
        },
      })
      .expect(200);

    expect(response.body).toMatchObject({
      clientDraftId: draftId,
      alreadySynchronized: false,
      specimen: {
        id: specimenId,
        specimenCategory: 'ZOOLOGY',
        scientificName: 'Testus specimenus',
        status: 'UNCATALOGED',
        publicDisplay: false,
        createdBy: curatorAccountId,
      },
    });
    expect(receiptCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        created_by: curatorAccountId,
        client_draft_id: draftId,
        specimen_id: specimenId,
      }) as Record<string, unknown>,
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: curatorAccountId,
        affected_record_id: specimenId,
        action: 'SYNC_OFFLINE_SPECIMEN_DRAFT',
        status: 'SUCCESS',
      }) as Record<string, unknown>,
    });
  });

  it('requires an active curator account', async () => {
    await request(app.getHttpServer())
      .post('/offline-sync/specimen-drafts')
      .send({ clientDraftId: draftId, draft: {} })
      .expect(401);

    await request(app.getHttpServer())
      .post('/offline-sync/specimen-drafts')
      .set('Authorization', `Bearer ${developerToken}`)
      .send({ clientDraftId: draftId, draft: {} })
      .expect(403);

    expect(specimenCreate).not.toHaveBeenCalled();
  });

  it('rejects invalid IDs and unsupported offline operations', async () => {
    await request(app.getHttpServer())
      .post('/offline-sync/specimen-drafts')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ clientDraftId: 'not-a-uuid', draft: {} })
      .expect(400);

    await request(app.getHttpServer())
      .post('/offline-sync/specimen-drafts')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ clientDraftId: draftId, draft: { imagePath: 'not-allowed' } })
      .expect(400);

    expect(specimenCreate).not.toHaveBeenCalled();
    expect(receiptCreate).not.toHaveBeenCalled();
  });

  it('rejects changed content when a client draft ID was already used', async () => {
    receiptFindUnique.mockResolvedValue({
      specimen_id: specimenId,
      payload_fingerprint: '0'.repeat(64),
    });

    await request(app.getHttpServer())
      .post('/offline-sync/specimen-drafts')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({
        clientDraftId: draftId,
        draft: { scientificName: 'Different content' },
      })
      .expect(409);

    expect(specimenCreate).not.toHaveBeenCalled();
    expect(receiptCreate).not.toHaveBeenCalled();
  });
});
