import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorageService } from '../src/supabase/storage.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

// Mocked-database coverage for the Developer's AR exhibit picker and the
// server-side deploy rule (REQ-4.13-03, REQ-4.2-04). The live suite in
// developer.e2e-spec.ts covers the same routes against a real project.
describe('Developer AR exhibits (e2e)', () => {
  const curatorToken = 'curator-ar-token';
  const developerToken = 'developer-ar-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const approvedExhibitId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const archivedExhibitId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const unapprovedExhibitId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const assetId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const glbHeader = Buffer.from([
    0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x00, 0x00,
  ]);

  let app: INestApplication<App>;
  let exhibitFindMany: jest.Mock;
  let arAssetCreate: jest.Mock;
  let arAssetUpdate: jest.Mock;
  let storageMock: { upload: jest.Mock; remove: jest.Mock };

  const asset = (exhibitId: string) => ({
    id: assetId,
    exhibit_id: exhibitId,
    storage_path: `${exhibitId}/model.glb`,
    model_format: 'glb',
    is_enabled: false,
  });

  // Keyed by id; what exhibit.findUnique returns for the deploy check.
  const exhibits: Record<
    string,
    {
      archived_at: Date | null;
      specimen: { status: string; public_display_allowed: boolean };
    }
  > = {
    [approvedExhibitId]: {
      archived_at: null,
      specimen: { status: 'CATALOGED', public_display_allowed: true },
    },
    [archivedExhibitId]: {
      archived_at: new Date('2026-09-01T00:00:00.000Z'),
      specimen: { status: 'CATALOGED', public_display_allowed: true },
    },
    [unapprovedExhibitId]: {
      archived_at: null,
      specimen: { status: 'CATALOGED', public_display_allowed: false },
    },
  };

  beforeEach(async () => {
    exhibitFindMany = jest.fn(() => [
      {
        id: approvedExhibitId,
        public_slug: 'giant-beetle',
        status: 'PUBLISHED',
        archived_at: null,
        specimen: {
          common_name: 'Giant Beetle',
          scientific_name: 'Titanus giganteus',
          status: 'CATALOGED',
          public_display_allowed: true,
        },
        ar_asset: [],
      },
      {
        id: archivedExhibitId,
        public_slug: 'old-moth',
        status: 'DISABLED',
        archived_at: exhibits[archivedExhibitId].archived_at,
        specimen: {
          common_name: 'Old Moth',
          scientific_name: 'Actias luna',
          status: 'CATALOGED',
          public_display_allowed: true,
        },
        ar_asset: [asset(archivedExhibitId)],
      },
    ]);
    arAssetCreate = jest.fn(({ data }: { data: { exhibit_id: string } }) =>
      asset(data.exhibit_id),
    );
    arAssetUpdate = jest.fn(() => asset(approvedExhibitId));
    storageMock = {
      upload: jest.fn(
        (_bucket: string, folder: string) => `${folder}/model.glb`,
      ),
      remove: jest.fn(() => Promise.resolve()),
    };

    const prismaMock = {
      user_account: {
        findUnique: jest.fn(
          ({ where }: { where: { auth_user_id: string } }) => {
            if (where.auth_user_id === curatorAuthId) {
              return {
                id: '22222222-2222-4222-8222-222222222222',
                role: 'CURATOR',
                status: 'ACTIVE',
              };
            }
            if (where.auth_user_id === developerAuthId) {
              return {
                id: '44444444-4444-4444-8444-444444444444',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
      },
      exhibit: {
        findMany: exhibitFindMany,
        findUnique: jest.fn(
          ({ where }: { where: { id: string } }) => exhibits[where.id] ?? null,
        ),
      },
      ar_asset: {
        create: arAssetCreate,
        update: arAssetUpdate,
        findUnique: jest.fn(({ where }: { where: { id: string } }) =>
          where.id === assetId ? asset(approvedExhibitId) : null,
        ),
      },
      audit_log: { create: jest.fn(() => ({})) },
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
            data: { user: { id, email: 'ar@example.com', app_metadata: {} } },
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

  describe('GET /developer/ar-exhibits', () => {
    it('401s without a token', async () => {
      await request(app.getHttpServer())
        .get('/developer/ar-exhibits')
        .expect(401);
      expect(exhibitFindMany).not.toHaveBeenCalled();
    });

    it('403s for a Curator', async () => {
      await request(app.getHttpServer())
        .get('/developer/ar-exhibits')
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(403);
      expect(exhibitFindMany).not.toHaveBeenCalled();
    });

    it('200s for a Developer with curator-approved exhibits and cleanup-only ones', async () => {
      const response = await request(app.getHttpServer())
        .get('/developer/ar-exhibits')
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      expect(exhibitFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              {
                archived_at: null,
                specimen: { status: 'CATALOGED', public_display_allowed: true },
              },
              { ar_asset: { some: {} } },
            ],
          },
        }),
      );
      expect(response.body).toEqual([
        {
          id: approvedExhibitId,
          publicSlug: 'giant-beetle',
          status: 'PUBLISHED',
          archived: false,
          deployable: true,
          commonName: 'Giant Beetle',
          scientificName: 'Titanus giganteus',
          assets: [],
        },
        {
          id: archivedExhibitId,
          publicSlug: 'old-moth',
          status: 'DISABLED',
          archived: true,
          deployable: false,
          commonName: 'Old Moth',
          scientificName: 'Actias luna',
          assets: [
            {
              id: assetId,
              exhibitId: archivedExhibitId,
              modelUrl: `${archivedExhibitId}/model.glb`,
              modelFormat: 'glb',
              isEnabled: false,
            },
          ],
        },
      ]);
    });
  });

  describe('POST /developer/ar-assets', () => {
    const upload = (exhibitId: string) =>
      request(app.getHttpServer())
        .post('/developer/ar-assets')
        .set('Authorization', `Bearer ${developerToken}`)
        .field('exhibitId', exhibitId)
        .field('modelFormat', 'glb')
        .attach('file', glbHeader, 'model.glb');

    it('deploys to a curator-approved exhibit', async () => {
      const response = await upload(approvedExhibitId).expect(201);

      expect(response.body).toMatchObject({
        exhibitId: approvedExhibitId,
        isEnabled: false,
      });
      expect(arAssetCreate).toHaveBeenCalled();
    });

    it('rejects an exhibit whose specimen is not approved for public display', async () => {
      await upload(unapprovedExhibitId).expect(400);
      expect(storageMock.upload).not.toHaveBeenCalled();
      expect(arAssetCreate).not.toHaveBeenCalled();
    });

    it('rejects an archived exhibit', async () => {
      await upload(archivedExhibitId).expect(400);
      expect(storageMock.upload).not.toHaveBeenCalled();
      expect(arAssetCreate).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /developer/ar-assets/:id', () => {
    const move = (exhibitId: string) =>
      request(app.getHttpServer())
        .patch(`/developer/ar-assets/${assetId}`)
        .set('Authorization', `Bearer ${developerToken}`)
        .field('exhibitId', exhibitId);

    it('rejects moving an asset to an exhibit that is not curator-approved', async () => {
      await move(unapprovedExhibitId).expect(400);
      await move(archivedExhibitId).expect(400);
      expect(arAssetUpdate).not.toHaveBeenCalled();
    });

    it('moves an asset to another curator-approved exhibit', async () => {
      exhibits['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'] =
        exhibits[approvedExhibitId];

      await move('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee').expect(200);
      expect(arAssetUpdate).toHaveBeenCalledWith({
        where: { id: assetId },
        data: { exhibit_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' },
      });
    });
  });
});
