/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- Supertest response bodies are typed as any. */
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { randomUUID } from 'node:crypto';
import * as dotenv from 'dotenv';
import { AppModule } from './../src/app.module';

dotenv.config();

// -----------------------------------------------------------------------
// This suite hits a REAL Supabase project and a REAL Postgres database —
// point it at a dedicated test/staging project, never production. It
// reuses the same TEST_CURATOR_*/TEST_DEVELOPER_* accounts as
// test/auth.e2e-spec.ts, and additionally needs:
//   - An `ar-assets` storage bucket to exist (private is fine).
//   - DATABASE_URL / DIRECT_URL set for Prisma (see .env.example).
// Everything this suite creates (a Collection/Specimen/Exhibit fixture
// chain, plus any onboarded curator account) is torn down in afterAll.
// -----------------------------------------------------------------------

const describeLiveDeveloperE2e =
  process.env.RUN_LIVE_DEVELOPER_E2E === 'true' ? describe : describe.skip;
const VALID_GLB_HEADER = Buffer.from([
  0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, 0x0c, 0x00, 0x00, 0x00,
]);

describeLiveDeveloperE2e('Developer module (live e2e)', () => {
  let app: INestApplication<App>;
  let curatorToken: string;
  let developerToken: string;
  let supabaseAdmin: SupabaseClient;

  let prisma: PrismaClient;

  let fixtureCuratorAccountId: string;
  let fixtureCollectionId: string;
  let fixtureSpecimenId: string;
  let fixtureExhibitId: string;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
    const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
    if (
      !connectionString ||
      !supabaseUrl ||
      !supabaseAnonKey ||
      !supabaseSecretKey
    ) {
      throw new Error(
        'DATABASE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, and ' +
          'SUPABASE_SECRET_KEY are required when RUN_LIVE_DEVELOPER_E2E=true.',
      );
    }

    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey);

    const curatorLogin = await supabase.auth.signInWithPassword({
      email: process.env.TEST_CURATOR_EMAIL!,
      password: process.env.TEST_CURATOR_PASSWORD!,
    });
    curatorToken = curatorLogin.data.session?.access_token ?? '';
    const curatorAuthUserId = curatorLogin.data.user?.id ?? '';

    const developerLogin = await supabase.auth.signInWithPassword({
      email: process.env.TEST_DEVELOPER_EMAIL!,
      password: process.env.TEST_DEVELOPER_PASSWORD!,
    });
    developerToken = developerLogin.data.session?.access_token ?? '';

    if (!curatorToken || !developerToken) {
      throw new Error(
        'Failed to obtain test tokens — check that TEST_CURATOR_* / ' +
          'TEST_DEVELOPER_* accounts exist in Supabase.',
      );
    }

    const curatorAccount = await prisma.user_account.findUnique({
      where: { auth_user_id: curatorAuthUserId },
    });

    if (!curatorAccount) {
      throw new Error(
        'TEST_CURATOR_EMAIL has no corresponding user_account row — ' +
          'seed one (role CURATOR, status ACTIVE) before running this suite.',
      );
    }
    fixtureCuratorAccountId = curatorAccount.id;

    // Minimal specimen + exhibit chain so the AR asset endpoints have a
    // real exhibit to attach to. Nothing about this fixture is exercised
    // by the Developer module itself — it only reads exhibit.archived_at.
    const collection = await prisma.collection.create({
      data: { collection_name: `E2E Developer Suite ${randomUUID()}` },
    });
    fixtureCollectionId = collection.id;

    const specimen = await prisma.specimen.create({
      data: {
        collection_id: fixtureCollectionId,
        created_by: fixtureCuratorAccountId,
        scientific_name: 'Testus fixturus',
        common_name: 'E2E fixture specimen',
        status: 'CATALOGED',
        public_display_allowed: true,
      },
    });
    fixtureSpecimenId = specimen.id;

    const exhibit = await prisma.exhibit.create({
      data: {
        specimen_id: fixtureSpecimenId,
        created_by: fixtureCuratorAccountId,
        public_slug: `e2e-developer-${randomUUID()}`,
        status: 'UNPUBLISHED',
      },
    });
    fixtureExhibitId = exhibit.id;
  });

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await prisma.ar_asset.deleteMany({
      where: { exhibit_id: fixtureExhibitId },
    });
    await prisma.exhibit
      .delete({ where: { id: fixtureExhibitId } })
      .catch(() => undefined);
    await prisma.specimen
      .delete({ where: { id: fixtureSpecimenId } })
      .catch(() => undefined);
    await prisma.collection
      .delete({ where: { id: fixtureCollectionId } })
      .catch(() => undefined);
    await prisma.$disconnect();
  });

  describe('role-based access control (REQ-4.2-01/08)', () => {
    it('rejects requests with no token', () => {
      return request(app.getHttpServer())
        .get('/developer/curators')
        .expect(401);
    });

    it('blocks a curator from every developer route', async () => {
      await request(app.getHttpServer())
        .get('/developer/curators')
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .post('/developer/curators/onboard')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ email: 'blocked@example.com', fullName: 'Blocked' })
        .expect(403);

      await request(app.getHttpServer())
        .post('/developer/ar-assets')
        .set('Authorization', `Bearer ${curatorToken}`)
        .field('exhibitId', fixtureExhibitId)
        .field('modelFormat', 'glb')
        .attach('file', VALID_GLB_HEADER, 'model.glb')
        .expect(403);
    });

    it('allows an authenticated developer to list curator accounts', () => {
      return request(app.getHttpServer())
        .get('/developer/curators')
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);
    });
  });

  describe('curator account administration (REQ-4.2-02/03)', () => {
    const testEmail = `e2e-onboard-${randomUUID()}@example.com`;
    let onboardedAccountId: string;
    let onboardedAuthUserId: string;

    afterAll(async () => {
      if (onboardedAccountId) {
        await prisma.user_account
          .delete({ where: { id: onboardedAccountId } })
          .catch(() => undefined);
      }
      if (onboardedAuthUserId) {
        await supabaseAdmin.auth.admin
          .deleteUser(onboardedAuthUserId)
          .catch(() => undefined);
      }
    });

    it('rejects onboarding with an invalid email (DTO validation)', () => {
      return request(app.getHttpServer())
        .post('/developer/curators/onboard')
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ email: 'not-an-email', fullName: 'Bad Email' })
        .expect(400);
    });

    it('onboards a new curator and returns an ACTIVE curator account', async () => {
      const res = await request(app.getHttpServer())
        .post('/developer/curators/onboard')
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ email: testEmail, fullName: 'E2E Onboarded Curator' })
        .expect(201);

      expect(res.body).toMatchObject({
        fullName: 'E2E Onboarded Curator',
        role: 'CURATOR',
        status: 'ACTIVE',
      });
      onboardedAccountId = res.body.id;
      onboardedAuthUserId = res.body.authUserId;
    });

    it('404s when changing status on an unknown account id', () => {
      return request(app.getHttpServer())
        .patch(`/developer/curators/${randomUUID()}/status`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ status: 'ACTIVE', authorizationReason: 'not found check' })
        .expect(404);
    });

    it('403s when attempting to change a Developer account status', async () => {
      const developerAccount = await prisma.user_account.findFirst({
        where: { role: 'DEVELOPER' },
      });
      if (!developerAccount) {
        // Nothing to assert if no developer account is seeded — skip cleanly
        // rather than failing the suite over unrelated seed data.
        return;
      }

      await request(app.getHttpServer())
        .patch(`/developer/curators/${developerAccount.id}/status`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ status: 'INACTIVE', authorizationReason: 'should be denied' })
        .expect(403);
    });

    it('deactivates the onboarded curator with a recorded authorization reason', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/developer/curators/${onboardedAccountId}/status`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ status: 'INACTIVE', authorizationReason: 'E2E test teardown' })
        .expect(200);

      expect(res.body.status).toBe('INACTIVE');
    });

    it('rejects a status change with no authorizationReason (DTO validation)', () => {
      return request(app.getHttpServer())
        .patch(`/developer/curators/${onboardedAccountId}/status`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ status: 'ACTIVE' })
        .expect(400);
    });
  });

  describe('AR asset deployment (REQ-4.2-04/05)', () => {
    let createdAssetId: string;

    it('404s when the exhibit does not exist', () => {
      return request(app.getHttpServer())
        .post('/developer/ar-assets')
        .set('Authorization', `Bearer ${developerToken}`)
        .field('exhibitId', randomUUID())
        .field('modelFormat', 'glb')
        .attach('file', VALID_GLB_HEADER, 'model.glb')
        .expect(404);
    });

    it('400s when the file extension does not match the declared modelFormat', () => {
      return request(app.getHttpServer())
        .post('/developer/ar-assets')
        .set('Authorization', `Bearer ${developerToken}`)
        .field('exhibitId', fixtureExhibitId)
        .field('modelFormat', 'glb')
        .attach('file', Buffer.from('not actually a glb'), 'model.gltf')
        .expect(400);
    });

    it('uploads a new AR asset and creates it disabled by default', async () => {
      const res = await request(app.getHttpServer())
        .post('/developer/ar-assets')
        .set('Authorization', `Bearer ${developerToken}`)
        .field('exhibitId', fixtureExhibitId)
        .field('modelFormat', 'glb')
        .attach('file', VALID_GLB_HEADER, 'model.glb')
        .expect(201);

      expect(res.body).toMatchObject({
        exhibitId: fixtureExhibitId,
        modelFormat: 'glb',
        isEnabled: false,
      });
      createdAssetId = res.body.id;
    });

    it('activates the AR asset', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/developer/ar-assets/${createdAssetId}/activate`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      expect(res.body.isEnabled).toBe(true);
    });

    it('deactivates the AR asset', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/developer/ar-assets/${createdAssetId}/deactivate`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);

      expect(res.body.isEnabled).toBe(false);
    });

    it('updates metadata without replacing the file', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/developer/ar-assets/${createdAssetId}`)
        .set('Authorization', `Bearer ${developerToken}`)
        .field('isEnabled', 'true')
        .expect(200);

      expect(res.body.isEnabled).toBe(true);
    });

    it('removes the AR asset', () => {
      return request(app.getHttpServer())
        .delete(`/developer/ar-assets/${createdAssetId}`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(200);
    });

    it('404s when removing an already-removed asset', () => {
      return request(app.getHttpServer())
        .delete(`/developer/ar-assets/${createdAssetId}`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(404);
    });
  });
});
