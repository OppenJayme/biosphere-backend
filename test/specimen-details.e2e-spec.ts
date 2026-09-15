import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Specimen details (e2e)', () => {
  const curatorToken = 'curator-detail-token';
  const developerToken = 'developer-detail-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const developerAuthId = '22222222-2222-4222-8222-222222222222';
  const curatorAccountId = '33333333-3333-4333-8333-333333333333';
  const specimenId = '44444444-4444-4444-8444-444444444444';
  const missingId = '55555555-5555-4555-8555-555555555555';
  const testDate = new Date('2026-09-01T00:00:00.000Z');

  let app: INestApplication<App>;

  beforeEach(async () => {
    const specimenRecord = {
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
      collection: null,
      specimen_taxonomy: null,
      specimen_provenance: null,
      specimen_lot: [],
      specimen_media: [],
      specimen_tag: [],
    };

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
      specimen: {
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          where.id === specimenId ? specimenRecord : null,
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
      .get(`/specimens/${specimenId}/details`)
      .expect(401));

  it('rejects an active Developer because details are curator-only', () =>
    request(app.getHttpServer())
      .get(`/specimens/${specimenId}/details`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403));

  it('returns the integrated detail response to an active Curator', async () => {
    const response = await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/details`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        specimen: expect.objectContaining({ id: specimenId }),
        collection: null,
        taxonomy: null,
        provenance: null,
        activeLots: [],
        lotOverview: { activeLotCount: 0, totalQuantity: 0 },
        media: [],
        tags: [],
      }),
    );
  });

  it('rejects a malformed specimen UUID before querying details', () =>
    request(app.getHttpServer())
      .get('/specimens/not-a-uuid/details')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400));

  it('returns 404 for a valid but missing specimen UUID', () =>
    request(app.getHttpServer())
      .get(`/specimens/${missingId}/details`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(404));
});
