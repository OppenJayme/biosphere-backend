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
  let arAssets: Array<Record<string, unknown>>;
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
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
  };
  let auditDelegate: { create: jest.Mock; findFirst: jest.Mock };
  let storageUploadMock: jest.Mock;
  let storageRemoveMock: jest.Mock;

  // The migration default for exhibit.public_specimen_fields.
  const allPublicFields = [
    'commonName',
    'scientificName',
    'collection',
    'kingdom',
    'phylum',
    'class',
    'order',
    'family',
    'genus',
    'species',
    'habitat',
    'ecologicalRole',
    'conservationStatus',
  ];
  const filledContent = {
    public_description: 'A rare specimen.',
    interesting_facts: 'It has six legs.',
    distribution: 'Philippines',
    diet: 'Grass',
  };

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
      public_specimen_fields: [...allPublicFields],
      status: 'UNPUBLISHED',
      published_at: null,
      archived_at: null,
      created_at: testDate,
      updated_at: testDate,
    };

    arAssets = [];
    // Rows come back with the relations the service includes: the specimen
    // summary (curator and public fields) and the exhibit's AR assets.
    // The public query selects only enabled AR assets; the mock honours that.
    const withRelations = (
      record: Record<string, unknown>,
      args?: { include?: { ar_asset?: { where?: { is_enabled?: boolean } } } },
    ) => ({
      ...record,
      specimen: {
        ...specimenRecord,
        common_name: 'Six-legged Carabao',
        scientific_name: 'Bubalus bubalis',
        accession_number: 'USCBM-MAM-001',
        collection: null,
        specimen_taxonomy: null,
      },
      ar_asset: args?.include?.ar_asset?.where?.is_enabled
        ? arAssets.filter((asset) => asset.is_enabled)
        : arAssets,
      exhibit_media: [],
    });

    specimenDelegate = {
      findUnique: jest.fn(() => specimenRecord),
    };

    exhibitDelegate = {
      findUnique: jest.fn((args: Parameters<typeof withRelations>[1]) =>
        withRelations(exhibitRecord, args),
      ),
      findFirst: jest.fn(() => null),
      findMany: jest.fn(() => [withRelations(exhibitRecord)]),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        exhibitRecord = {
          ...exhibitRecord,
          ...data,
          id: exhibitId,
          created_at: testDate,
          updated_at: testDate,
        };
        return withRelations(exhibitRecord);
      }),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        exhibitRecord = { ...exhibitRecord, ...data };
        return withRelations(exhibitRecord);
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
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => ({
        id: mediaId,
        exhibit_id: exhibitId,
        storage_path: `${exhibitId}/photo.jpg`,
        display_order: 0,
        caption: null,
        is_cover: false,
        ...data,
      })),
      updateMany: jest.fn(() => ({ count: 0 })),
      delete: jest.fn(() => ({})),
    };

    // findFirst backs the retired-slug check (no retired slugs by default).
    auditDelegate = {
      create: jest.fn(() => ({})),
      findFirst: jest.fn(() => null),
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
      specimen: specimenDelegate,
      exhibit: exhibitDelegate,
      exhibit_media: exhibitMediaDelegate,
      ar_asset: {
        updateMany: jest.fn(
          ({
            where,
            data,
          }: {
            where: { is_enabled: boolean };
            data: { is_enabled: boolean };
          }) => {
            arAssets = arAssets.map((asset) =>
              asset.is_enabled === where.is_enabled
                ? { ...asset, is_enabled: data.is_enabled }
                : asset,
            );
          },
        ),
      },
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
          createSignedUrl: jest.fn((path: string) =>
            Promise.resolve({
              data: { signedUrl: `https://signed.example/${path}` },
              error: null,
            }),
          ),
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

      expect(response.body).toEqual({
        publicSlug: 'six-legged-carabao',
        commonName: 'Six-legged Carabao',
        scientificName: 'Bubalus bubalis',
        collection: null,
        taxonomy: {
          kingdom: null,
          phylum: null,
          class: null,
          order: null,
          family: null,
          genus: null,
          species: null,
        },
        habitat: null,
        ecologicalRole: null,
        conservationStatus: null,
        interestingFacts: null,
        publicDescription: null,
        distribution: null,
        diet: null,
        layoutType: null,
        media: [],
        ar: { available: false, models: [] },
      });
      expect(JSON.stringify(response.body)).not.toContain('USCBM-MAM-001');
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
      expect(exhibitDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            specimen_id: specimenId,
            created_by: curatorAccountId,
            status: 'UNPUBLISHED',
          }),
        }),
      );
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
      Object.assign(exhibitRecord, filledContent);
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

    it('rejects publishing a disabled exhibit', async () => {
      exhibitRecord.status = 'DISABLED';

      await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/publish`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
      expect(auditDelegate.create).not.toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'PUBLISH_EXHIBIT' }),
      });
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

      expect(storageRemoveMock).toHaveBeenCalledWith([
        `${exhibitId}/photo.jpg`,
      ]);
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'REMOVE_EXHIBIT_MEDIA' }),
      });
    });

    it('rejects removing media from an archived exhibit', async () => {
      exhibitRecord.archived_at = testDate;
      exhibitMediaDelegate.findUnique.mockResolvedValueOnce({
        id: mediaId,
        exhibit_id: exhibitId,
        storage_path: `${exhibitId}/photo.jpg`,
      });

      await request(app.getHttpServer())
        .delete(`/exhibits/${exhibitId}/media/${mediaId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);

      expect(exhibitMediaDelegate.delete).not.toHaveBeenCalled();
      expect(storageRemoveMock).not.toHaveBeenCalled();
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
  describe('public URL and slug stability (REQ-4.12-04/10)', () => {
    it('returns the public URL and AR state on curator views', async () => {
      const response = await request(app.getHttpServer())
        .get(`/exhibits/${exhibitId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        publicUrl: 'http://localhost:3000/exhibits/six-legged-carabao',
        arEnabled: false,
        arAssetCount: 0,
        specimen: {
          commonName: 'Six-legged Carabao',
          accessionNumber: 'USCBM-MAM-001',
        },
      });
    });

    it('does not let a content edit change the public URL', async () => {
      await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ publicSlug: 'renamed' })
        .expect(400);

      expect(exhibitDelegate.update).not.toHaveBeenCalled();
    });

    it('replaces the URL on purpose and audits the old and new slug', async () => {
      exhibitDelegate.findUnique
        .mockImplementationOnce(() => ({
          ...exhibitRecord,
          specimen: { common_name: null, scientific_name: null },
          ar_asset: [],
        }))
        .mockResolvedValueOnce(null);

      const response = await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/replace-url`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ publicSlug: 'carabao-v2' })
        .expect(200);

      expect(response.body.publicUrl).toBe(
        'http://localhost:3000/exhibits/carabao-v2',
      );
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'REPLACE_EXHIBIT_URL',
          details: {
            previousSlug: 'six-legged-carabao',
            publicSlug: 'carabao-v2',
          },
        }),
      });
    });

    it('validates the replacement slug', () =>
      request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/replace-url`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ publicSlug: 'Bad Slug' })
        .expect(400));
  });

  describe('retired URLs and disable rules', () => {
    it('refuses a slug another exhibit retired, so old labels never open a different specimen', async () => {
      exhibitDelegate.findUnique.mockResolvedValueOnce(null);
      auditDelegate.findFirst.mockResolvedValueOnce({ id: 'audit-1' });

      await request(app.getHttpServer())
        .post('/exhibits')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ specimenId, publicSlug: 'giant-beetle' })
        .expect(409);
      expect(exhibitDelegate.create).not.toHaveBeenCalled();
    });

    it('only disables a published exhibit', async () => {
      await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/disable`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
      expect(exhibitDelegate.update).not.toHaveBeenCalled();
    });
  });

  describe('unpublish', () => {
    it('takes a published page offline so its URL shows the unavailable state', async () => {
      exhibitRecord.status = 'PUBLISHED';

      const response = await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/unpublish`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(response.body.status).toBe('UNPUBLISHED');
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'UNPUBLISH_EXHIBIT' }),
      });
      await request(app.getHttpServer())
        .get('/exhibits/public/six-legged-carabao')
        .expect(404);
    });

    it('rejects unpublishing a disabled exhibit', async () => {
      exhibitRecord.status = 'DISABLED';

      await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/unpublish`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
    });
  });

  describe('curator AR on/off (REQ-4.13-02/04)', () => {
    const glb = {
      id: 'asset-1',
      is_enabled: false,
      storage_path: `${exhibitId}/model.glb`,
      model_format: 'glb',
    };

    it('cannot enable AR before a developer uploads an asset', async () => {
      await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/ar`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ enabled: true })
        .expect(400);
    });

    it('turns View in AR on and off on the public page', async () => {
      exhibitRecord.status = 'PUBLISHED';
      arAssets = [glb];

      const hidden = await request(app.getHttpServer())
        .get('/exhibits/public/six-legged-carabao')
        .expect(200);
      expect(hidden.body.ar).toEqual({ available: false, models: [] });

      const enabled = await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/ar`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ enabled: true })
        .expect(200);
      expect(enabled.body).toMatchObject({ arEnabled: true, arAssetCount: 1 });

      const shown = await request(app.getHttpServer())
        .get('/exhibits/public/six-legged-carabao')
        .expect(200);
      expect(shown.body.ar).toEqual({
        available: true,
        models: [
          {
            format: 'glb',
            url: `https://signed.example/${exhibitId}/model.glb`,
          },
        ],
      });

      const disabled = await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/ar`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ enabled: false })
        .expect(200);
      expect(disabled.body.arEnabled).toBe(false);
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'DISABLE_EXHIBIT_AR' }),
      });
      const hiddenAgain = await request(app.getHttpServer())
        .get('/exhibits/public/six-legged-carabao')
        .expect(200);
      expect(hiddenAgain.body.ar.available).toBe(false);
    });

    it('validates the body and keeps developers out of the curator AR switch', async () => {
      arAssets = [glb];
      await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/ar`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ enabled: 'yes' })
        .expect(400);
      await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/ar`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ enabled: true })
        .expect(403);
      expect(arAssets[0].is_enabled).toBe(false);
    });
  });

  describe('QR code and printable label (REQ-4.12-05/06)', () => {
    it('returns a PNG QR code by default', async () => {
      const response = await request(app.getHttpServer())
        .get(`/exhibits/${exhibitId}/qr?size=256`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('image/png');
      expect(response.headers['content-disposition']).toBe(
        'inline; filename="six-legged-carabao-qr.png"',
      );
      expect((response.body as Buffer).subarray(1, 4).toString()).toBe('PNG');
    });

    it('returns an SVG QR code and a printable SVG label', async () => {
      const qr = await request(app.getHttpServer())
        .get(`/exhibits/${exhibitId}/qr?format=svg`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);
      expect(qr.headers['content-type']).toBe('image/svg+xml');

      const label = await request(app.getHttpServer())
        .get(`/exhibits/${exhibitId}/label`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);
      const svg = (label.body as Buffer).toString();
      expect(label.headers['content-type']).toBe('image/svg+xml');
      expect(svg).toContain('Six-legged Carabao');
      expect(svg).toContain('Bubalus bubalis');
      // The complete URL is printed, wrapped after '/exhibits/'.
      expect(svg).toContain('>http://localhost:3000/exhibits/<');
      expect(svg).toContain('>six-legged-carabao<');
    });

    it('validates the QR options and restricts QR codes to curators', async () => {
      await request(app.getHttpServer())
        .get(`/exhibits/${exhibitId}/qr?size=10`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(`/exhibits/${exhibitId}/qr?format=gif`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
      await request(app.getHttpServer())
        .get(`/exhibits/${exhibitId}/qr`)
        .expect(401);
      await request(app.getHttpServer())
        .get(`/exhibits/${exhibitId}/label`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(403);
    });

    it('refuses QR codes for an archived exhibit', async () => {
      exhibitRecord.archived_at = testDate;

      await request(app.getHttpServer())
        .get(`/exhibits/${exhibitId}/qr`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
    });
  });

  describe('media edits and list filters', () => {
    it('edits an image caption and cover flag', async () => {
      exhibitMediaDelegate.findUnique.mockResolvedValueOnce({
        id: mediaId,
        exhibit_id: exhibitId,
        storage_path: `${exhibitId}/photo.jpg`,
        display_order: 0,
        caption: null,
        is_cover: false,
      });

      const response = await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/media/${mediaId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ caption: 'Side view', isCover: true })
        .expect(200);

      expect(response.body).toMatchObject({
        id: mediaId,
        caption: 'Side view',
        isCover: true,
        previewUrl: `https://signed.example/${exhibitId}/photo.jpg`,
      });
    });

    it('rejects an empty media edit', () =>
      request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/media/${mediaId}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({})
        .expect(400));

    it('validates list filters', async () => {
      await request(app.getHttpServer())
        .get('/exhibits?status=PUBLISHED&arEnabled=true&search=carabao')
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);
      await request(app.getHttpServer())
        .get('/exhibits?arEnabled=maybe')
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
      await request(app.getHttpServer())
        .get('/exhibits?status=LIVE')
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
    });
  });
  describe('public specimen fields (REQ-4.12-03)', () => {
    const auth = () => `Bearer ${curatorToken}`;

    it('exposes the selection and what is missing for publishing on curator views', async () => {
      const response = await request(app.getHttpServer())
        .get(`/exhibits/${exhibitId}`)
        .set('Authorization', auth())
        .expect(200);

      expect(response.body.publicSpecimenFields).toEqual(allPublicFields);
      expect(response.body.missingForPublish).toEqual(['publicDescription']);
    });

    it('stores a selection on create in allowlist order', async () => {
      exhibitDelegate.findUnique.mockResolvedValueOnce(null); // slug pre-check

      const response = await request(app.getHttpServer())
        .post('/exhibits')
        .set('Authorization', auth())
        .send({
          specimenId,
          publicSlug: 'six-legged-carabao',
          publicSpecimenFields: ['habitat', 'commonName'],
        })
        .expect(201);

      expect(response.body.publicSpecimenFields).toEqual([
        'commonName',
        'habitat',
      ]);
    });

    it.each([
      ['an unknown field', ['commonName', 'accessionNumber']],
      ['a restricted field', ['remarks']],
      ['a duplicate', ['commonName', 'commonName']],
      ['a non-array', 'commonName'],
      ['null', null],
    ])('rejects %s with 400 and writes nothing', async (_label, value) => {
      await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}`)
        .set('Authorization', auth())
        .send({ publicSpecimenFields: value })
        .expect(400);
      expect(exhibitDelegate.update).not.toHaveBeenCalled();
    });

    it('updates the selection, audits the change, and filters the public page', async () => {
      Object.assign(exhibitRecord, filledContent, { status: 'PUBLISHED' });

      const updated = await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}`)
        .set('Authorization', auth())
        .send({ publicSpecimenFields: ['scientificName', 'family'] })
        .expect(200);
      expect(updated.body.publicSpecimenFields).toEqual([
        'scientificName',
        'family',
      ]);
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'UPDATE_EXHIBIT',
          details: {
            changedFields: ['publicSpecimenFields'],
            publicSpecimenFields: {
              previous: allPublicFields,
              current: ['scientificName', 'family'],
            },
          },
        }),
      });

      const page = await request(app.getHttpServer())
        .get(`/exhibits/public/${exhibitRecord.public_slug as string}`)
        .expect(200);
      expect(page.body).toEqual({
        publicSlug: 'six-legged-carabao',
        scientificName: 'Bubalus bubalis',
        taxonomy: { family: null },
        interestingFacts: 'It has six legs.',
        publicDescription: 'A rare specimen.',
        distribution: 'Philippines',
        diet: 'Grass',
        layoutType: null,
        media: [],
        ar: { available: false, models: [] },
      });
    });

    it('refuses to publish without a public description and names what is missing', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/publish`)
        .set('Authorization', auth())
        .expect(400);

      expect(response.body.message).toContain('Missing: publicDescription.');
      expect(exhibitRecord.status).toBe('UNPUBLISHED');
    });

    it('does not let a published exhibit lose its description', async () => {
      Object.assign(exhibitRecord, filledContent, { status: 'PUBLISHED' });

      await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}`)
        .set('Authorization', auth())
        .send({ publicDescription: null })
        .expect(400);
      expect(exhibitDelegate.update).not.toHaveBeenCalled();
    });

    it('publishes with only a description, since facts, distribution, and diet are optional', async () => {
      exhibitRecord.public_description = 'A fern.';

      const response = await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}/publish`)
        .set('Authorization', auth())
        .expect(200);
      expect(response.body).toMatchObject({
        status: 'PUBLISHED',
        missingForPublish: [],
      });

      // A published exhibit can still clear the optional content.
      await request(app.getHttpServer())
        .patch(`/exhibits/${exhibitId}`)
        .set('Authorization', auth())
        .send({ diet: null, interestingFacts: null })
        .expect(200);
    });
  });
});
