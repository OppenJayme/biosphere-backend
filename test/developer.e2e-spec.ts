import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { createClient } from '@supabase/supabase-js';
import { PrismaClient } from '@prisma/client';
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

describe('Developer module (e2e)', () => {
  let app: INestApplication<App>;
  let curatorToken: string;
  let developerToken: string;

  const prisma = new PrismaClient();

  let fixtureCuratorAccountId: string;
  let fixtureCollectionId: string;
  let fixtureSpecimenId: string;
  let fixtureExhibitId: string;

  beforeAll(async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    );

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

    const curatorAccount = await prisma.userAccount.findUnique({
      where: { authUserId: curatorAuthUserId },
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
      data: { collectionName: `E2E Developer Suite ${randomUUID()}` },
    });
    fixtureCollectionId = collection.id;

    const specimen = await prisma.specimen.create({
      data: {
        collectionId: fixtureCollectionId,
        createdById: fixtureCuratorAccountId,
        scientificName: 'Testus fixturus',
        commonName: 'E2E fixture specimen',
        status: 'CATALOGED',
        publicDisplayAllowed: true,
      },
    });
    fixtureSpecimenId = specimen.id;

    const exhibit = await prisma.exhibit.create({
      data: {
        specimenId: fixtureSpecimenId,
        createdById: fixtureCuratorAccountId,
        publicSlug: `e2e-developer-${randomUUID()}`,
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
    await prisma.arAsset.deleteMany({ where: { exhibitId: fixtureExhibitId } });
    await prisma.exhibit.delete({ where: { id: fixtureExhibitId } }).catch(() => undefined);
    await prisma.specimen.delete({ where: { id: fixtureSpecimenId } }).catch(() => undefined);
    await prisma.collection.delete({ where: { id: fixtureCollectionId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  describe('role-based access control (REQ-4.2-01/08)', () => {
    it('rejects requests with no token', () => {
      return request(app.getHttpServer()).get('/developer/curators').expect(401);
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
        .attach('file', Buffer.from('fake glb bytes'), 'model.glb')
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

    afterAll(async () => {
      if (onboardedAccountId) {
        await prisma.userAccount
          .delete({ where: { id: onboardedAccountId } })
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
    });

    it('404s when changing status on an unknown account id', () => {
      return request(app.getHttpServer())
        .patch(`/developer/curators/${randomUUID()}/status`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ status: 'ACTIVE', authorizationReason: 'not found check' })
        .expect(404);
    });

    it('403s when attempting to change a Developer account status', async () => {
      const developerAccount = await prisma.userAccount.findFirst({
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
        .attach('file', Buffer.from('fake glb bytes'), 'model.glb')
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
        .attach('file', Buffer.from('fake glb bytes'), 'model.glb')
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