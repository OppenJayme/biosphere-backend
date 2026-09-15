/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment -- Supertest response bodies and Jest asymmetric matchers are typed as any. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Exhibits (e2e)', () => {
  const curatorToken = 'curator-exhibit-token';
  const developerToken = 'developer-exhibit-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const specimenId = '44444444-4444-4444-8444-444444444444';
  const exhibitId = '55555555-5555-4555-8555-555555555555';
  const mediaId = '77777777-7777-4777-8777-777777777777';
  const testDate = new Date('2026-01-01T00:00:00.000Z');

  let app: INestApplication<App>;
  let specimenRecord: Record<string, unknown>;
  let exhibitRecord: Record<string, unknown>;
  let specimenDelegate: { findUnique: jest.Mock };
  let exhibitDelegate: {
    findUnique: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let exhibitMediaDelegate: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
  };
  let auditDelegate: { create: jest.Mock };
  let storageUploadMock: jest.Mock;
  let storageRemoveMock: jest.Mock;

  beforeEach(async () => {
    specimenRecord = {
      id: specimenId,
      status: 'CATALOGED',
      public_display_allowed: true,
      archived_at: null,
    };

    exhibitRecord = {
      id: exhibitId,
      specimen_id: specimenId,
      created_by: curatorAccountId,
      public_slug: 'six-legged-carabao',
      interesting_facts: null,
      public_description: null,
      distribution: null,
      diet: null,
      layout_type: null,
      status: 'UNPUBLISHED',
      published_at: null,
      archived_at: null,
      created_at: testDate,
      updated_at: testDate,
    };

    specimenDelegate = {
      findUnique: jest.fn(() => specimenRecord),
    };

    exhibitDelegate = {
      findUnique: jest.fn(() => exhibitRecord),
      findFirst: jest.fn(() => null),
      findMany: jest.fn(() => [exhibitRecord]),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        exhibitRecord = {
          ...exhibitRecord,
          ...data,
          id: exhibitId,
          created_at: testDate,
          updated_at: testDate,
        };
        return exhibitRecord;
      }),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        exhibitRecord = { ...exhibitRecord, ...data };
        return exhibitRecord;
      }),
    };

    exhibitMediaDelegate = {
      findUnique: jest.fn(),
      findMany: jest.fn(() => []),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => ({
        id: 'media-1',
        display_order: 0,
        caption: null,
        is_cover: false,
        ...data,
      })),
      updateMany: jest.fn(() => ({ count: 0 })),
      delete: jest.fn(() => ({})),
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
      exhibit: exhibitDelegate,
      exhibit_media: exhibitMediaDelegate,
      audit_log: auditDelegate,
      $transaction: jest.fn((callback: (transaction: unknown) => unknown) =>
        Promise.resolve(callback(prismaMock)),
      ),
    };

    // StorageService talks to Supabase Storage through this client, so the
    // media routes need `storage.from().upload()/.remove()` mocked in
    // addition to the usual `auth.getUser` used by SupabaseAuthGuard.
    storageUploadMock = jest.fn(() =>
      Promise.resolve({
        data: { path: `${exhibitId}/photo.jpg` },
        error: null,
      }),
    );
    storageRemoveMock = jest.fn(() =>
      Promise.resolve({ data: {}, error: null }),
    );

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
                email: 'exhibit-test@example.com',
                app_metadata: {},
              },
            },
            error: null,
          }
        : { data: { user: null }, error: { message: 'Invalid token' } };
    });

    const supabaseMock = {
      auth: { getUser },
      storage: {
        from: jest.fn(() => ({
          upload: storageUploadMock,
          remove: storageRemoveMock,
        })),
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(SUPABASE_CLIENT)
      .useValue(supabaseMock)
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

  describe('access control', () => {
    it('rejects a request without a Supabase access token', () =>
      request(app.getHttpServer()).get('/exhibits').expect(401));

    it('rejects an active Developer because exhibit routes are curator-only', () =>
      request(app.getHttpServer())
        .get('/exhibits')
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(403));
  });

  describe('public exhibit page', () => {
    it('404s for an unpublished slug', () =>
      request(app.getHttpServer())
        .get(`/exhibits/public/${exhibitRecord.public_slug as string}`)
        .expect(404));

    it('serves a published exhibit without a token or curator attribution', async () => {
      exhibitRecord.status = 'PUBLISHED';

      const response = await request(app.getHttpServer())
        .get(`/exhibits/public/${exhibitRecord.public_slug as string}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({ publicSlug: 'six-legged-carabao' }),
      );
      expect(response.body).not.toHaveProperty('createdBy');
    });
  });

  describe('create', () => {
    it('validates the request body before calling Prisma', async () => {
      await request(app.getHttpServer())
        .post('/exhibits')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ specimenId, publicSlug: 'Not A Valid Slug' })
        .expect(400);

      expect(exhibitDelegate.create).not.toHaveBeenCalled();
    });

    it('404s when the specimen does not exist', async () => {
      specimenDelegate.findUnique.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .post('/exhibits')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ specimenId, publicSlug: 'new-exhibit' })
        .expect(404);
    });

    it('400s when the specimen is not Cataloged and public-display approved', async () => {
      specimenDelegate.findUnique.mockResolvedValueOnce({
        ...specimenRecord,
        status: 'UNCATALOGED',
      });

      await request(app.getHttpServer())
        .post('/exhibits')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ specimenId, publicSlug: 'new-exhibit' })
        .expect(400);
    });

    it('409s when the specimen already has an active exhibit', async () => {
      exhibitDelegate.findFirst.mockResolvedValueOnce({ id: 'other-exhibit' });

      await request(app.getHttpServer())
        .post('/exhibits')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ specimenId, publicSlug: 'new-exhibit' })
        .expect(409);
    });

    it('409s when the slug is already in use', async () => {
      exhibitDelegate.findUnique.mockResolvedValueOnce({ id: 'other-exhibit' });

      await request(app.getHttpServer())
        .post('/exhibits')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ specimenId, publicSlug: 'six-legged-carabao' })
        .expect(409);
    });

    it('creates an exhibit and records an audit entry', async () => {
      exhibitDelegate.findUnique.mockResolvedValueOnce(null); // slug pre-check

      const response = await request(app.getHttpServer())
        .post('/exhibits')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({
          specimenId,
          publicSlug: 'six-legged-carabao',
          interestingFacts: 'Has six legs',
        })
        .expect(201);

      expect(response.body).toEqual(
        expect.objectContaining({
          specimenId,
          publicSlug: 'six-legged-carabao',
          status: 'UNPUBLISHED',
        }),
      );
      expect(exhibitDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          specimen_id: specimenId,
          created_by: curatorAccountId,
          status: 'UNPUBLISHED',
        }),
      });
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'CREATE_EXHIBIT' }),
      });
    });
  });

  describe('read', () => {
    it('lists active exhibits', async () => {
      const response = await request(app.getHttpServer())
        .get('/exhibits')
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(response.body).toEqual([
        expect.objectContaining({
          id: exhibitId,
          publicSlug: 'six-legged-carabao',
        }),
      ]);
    });

    it('retrieves one exhibit with its media', async () => {
      const response = await request(app.getHttpServer())
        .get(`/exhibits/${exhibitId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({ id: exhibitId, media: [] }),
      );
    });

    it('404s for an unknown exhibit id', async () => {
      exhibitDelegate.findUnique.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .get(`/exhibits/${exhibitId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(404);
    });
  });

  describe('update', () => {
    it('rejects an empty update payload', () =>
      request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({})
        .expect(400));

    it('updates editable content fields', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ diet: 'Insects and small vertebrates' })
        .expect(200);

      expect(response.body.diet).toBe('Insects and small vertebrates');
    });

    it('rejects edits to an archived exhibit', async () => {
      exhibitRecord.archived_at = testDate;

      await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ diet: 'Insects' })
        .expect(400);
    });
  });

  describe('lifecycle', () => {
    it('publishes an eligible exhibit', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/publish`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(response.body.status).toBe('PUBLISHED');
      expect(response.body.publishedAt).toBeTruthy();
    });

    it('blocks publishing when the specimen is no longer public-display approved', async () => {
      specimenDelegate.findUnique.mockResolvedValueOnce({
        ...specimenRecord,
        public_display_allowed: false,
      });

      await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/publish`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
    });

    it('disables a published exhibit', async () => {
      exhibitRecord.status = 'PUBLISHED';

      const response = await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/disable`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(response.body.status).toBe('DISABLED');
    });

    it('archives an exhibit and removes it from the public page', async () => {
      exhibitRecord.status = 'PUBLISHED';

      const archiveResponse = await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/archive`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(archiveResponse.body.status).toBe('DISABLED');
      expect(archiveResponse.body.archivedAt).toBeTruthy();

      await request(app.getHttpServer())
        .get(`/exhibits/public/${exhibitRecord.public_slug as string}`)
        .expect(404);
    });
  });

  describe('media', () => {
    it('uploads media through the exhibit-media bucket', async () => {
      const response = await request(app.getHttpServer())
        .post(`/exhibits/${exhibitId}/media`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .field('caption', 'Front view')
        .field('isCover', 'true')
        .attach(
          'file',
          Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
          'photo.jpg',
        )
        .expect(201);

      expect(storageUploadMock).toHaveBeenCalled();
      expect(response.body).toEqual(
        expect.objectContaining({ caption: 'Front view', isCover: true }),
      );
    });

    it('rejects media for an archived exhibit', async () => {
      exhibitRecord.archived_at = testDate;

      await request(app.getHttpServer())
        .post(`/exhibits/${exhibitId}/media`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .attach(
          'file',
          Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]),
          'photo.jpg',
        )
        .expect(400);

      expect(storageUploadMock).not.toHaveBeenCalled();
    });

    it('removes media and cleans up storage', async () => {
      exhibitMediaDelegate.findUnique.mockResolvedValueOnce({
        id: mediaId,
        exhibit_id: exhibitId,
        storage_path: `${exhibitId}/photo.jpg`,
      });

      await request(app.getHttpServer())
        .delete(`/exhibits/${exhibitId}/media/${mediaId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(storageRemoveMock).toHaveBeenCalledWith(
        'exhibit-media',
        `${exhibitId}/photo.jpg`,
      );
    });

    it('404s when the media does not belong to the exhibit', async () => {
      exhibitMediaDelegate.findUnique.mockResolvedValueOnce({
        id: mediaId,
        exhibit_id: 'some-other-exhibit-id',
        storage_path: 'some-other-exhibit-id/photo.jpg',
      });

      await request(app.getHttpServer())
        .delete(`/exhibits/${exhibitId}/media/${mediaId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(404);
    });
  });
});