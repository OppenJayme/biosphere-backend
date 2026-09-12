/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest response bodies and asymmetric matchers are typed as any. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/supabase/storage.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Specimen media (e2e)', () => {
  const curatorToken = 'curator-media-token';
  const developerToken = 'developer-media-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const specimenId = '44444444-4444-4444-8444-444444444444';
  const mediaId = '55555555-5555-4555-8555-555555555555';
  const testDate = new Date('2026-01-01T00:00:00.000Z');
  const storagePath = `${specimenId}/image.jpg`;
  const replacementPath = `${specimenId}/replacement.jpg`;

  let app: INestApplication<App>;
  let specimenRecord: Record<string, unknown>;
  let mediaRecord: Record<string, unknown> | null;
  let mediaDelegate: {
    aggregate: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  let storageMock: {
    upload: jest.Mock;
    remove: jest.Mock;
    createSignedUrl: jest.Mock;
  };

  beforeEach(async () => {
    specimenRecord = {
      id: specimenId,
      status: 'UNCATALOGED',
      archived_at: null,
    };
    mediaRecord = null;
    mediaDelegate = {
      aggregate: jest.fn(() => ({
        _max: { display_order: mediaRecord?.display_order ?? null },
      })),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        mediaRecord = { id: mediaId, ...data };
        return mediaRecord;
      }),
      delete: jest.fn(() => {
        const deleted = mediaRecord;
        mediaRecord = null;
        return deleted;
      }),
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        if (!mediaRecord) return null;
        if (where.id && where.id !== mediaId) return null;
        if (where.specimen_id && where.specimen_id !== specimenId) return null;
        return mediaRecord;
      }),
      findMany: jest.fn(() => (mediaRecord ? [mediaRecord] : [])),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        mediaRecord = { ...mediaRecord, ...data };
        return mediaRecord;
      }),
      updateMany: jest.fn(() => ({ count: 1 })),
    };
    storageMock = {
      upload: jest.fn(() => storagePath),
      remove: jest.fn(() => undefined),
      createSignedUrl: jest.fn(() => 'https://signed.example/image'),
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
        findUnique: jest.fn(() => specimenRecord),
        update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          specimenRecord = { ...specimenRecord, ...data };
          return specimenRecord;
        }),
      },
      specimen_media: mediaDelegate,
      specimen_revision_history: { create: jest.fn(() => ({})) },
      audit_log: { create: jest.fn(() => ({})) },
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
              user: { id, email: 'media@example.com', app_metadata: {} },
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
      .overrideProvider(StorageService)
      .useValue(storageMock)
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
      .get(`/specimens/${specimenId}/media`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/media`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('validates UUIDs, files, and strict multipart metadata', async () => {
    await request(app.getHttpServer())
      .post('/specimens/not-a-uuid/media')
      .set('Authorization', `Bearer ${curatorToken}`)
      .attach('file', Buffer.from('image'), {
        filename: 'image.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/media`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .field('caption', 'Missing file')
      .expect(400);

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/media`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .field('isCover', 'yes')
      .attach('file', Buffer.from('image'), {
        filename: 'image.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/media`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .field('displayOrder', '-1')
      .attach('file', Buffer.from('image'), {
        filename: 'image.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/media`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .field('unexpected', 'blocked')
      .attach('file', Buffer.from('image'), {
        filename: 'image.jpg',
        contentType: 'image/jpeg',
      })
      .expect(400);

    expect(storageMock.upload).not.toHaveBeenCalled();
  });

  it('uploads and returns normalized specimen media metadata', async () => {
    const response = await request(app.getHttpServer())
      .post(`/specimens/${specimenId}/media`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .field('caption', ' Dorsal view ')
      .field('displayOrder', '2')
      .field('isCover', 'true')
      .attach('file', Buffer.from('image'), {
        filename: 'image.jpg',
        contentType: 'image/jpeg',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: mediaId,
        specimenId,
        storagePath,
        caption: 'Dorsal view',
        displayOrder: 2,
        isCover: true,
      }),
    );
    expect(storageMock.upload).toHaveBeenCalledWith(
      'specimen-media',
      specimenId,
      expect.any(Buffer),
      'image/jpeg',
    );
  });

  it('lists, retrieves, and signs only stored specimen media', async () => {
    mediaRecord = {
      id: mediaId,
      specimen_id: specimenId,
      storage_path: storagePath,
      display_order: 0,
      caption: null,
      is_cover: true,
      created_at: testDate,
    };

    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/media`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual([
          expect.objectContaining({ id: mediaId, storagePath }),
        ]);
      });
    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/media/${mediaId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/media/${mediaId}/signed-url`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect({
        mediaId,
        signedUrl: 'https://signed.example/image',
        expiresIn: 300,
      });
  });

  it('updates metadata, selects a cover, replaces, and removes media', async () => {
    mediaRecord = {
      id: mediaId,
      specimen_id: specimenId,
      storage_path: storagePath,
      display_order: 0,
      caption: null,
      is_cover: false,
      created_at: testDate,
    };

    await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/media/${mediaId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ caption: ' Lateral view ', displayOrder: 4 })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({ caption: 'Lateral view', displayOrder: 4 }),
        );
      });

    await request(app.getHttpServer())
      .patch(`/specimens/${specimenId}/media/${mediaId}/cover`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({ isCover: true }),
        );
      });

    storageMock.upload.mockResolvedValueOnce(replacementPath);
    await request(app.getHttpServer())
      .put(`/specimens/${specimenId}/media/${mediaId}/file`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .attach('file', Buffer.from('replacement'), {
        filename: 'replacement.jpg',
        contentType: 'image/jpeg',
      })
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            media: expect.objectContaining({
              id: mediaId,
              storagePath: replacementPath,
            }),
            previousStorageCleanupPending: false,
          }),
        );
      });

    await request(app.getHttpServer())
      .delete(`/specimens/${specimenId}/media/${mediaId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200)
      .expect({
        id: mediaId,
        removed: true,
        storageCleanupPending: false,
      });

    await request(app.getHttpServer())
      .get(`/specimens/${specimenId}/media/${mediaId}`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(404);
  });
});
