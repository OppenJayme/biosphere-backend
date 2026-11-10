/** Real Prisma enum decoding through protected HTTP on a fresh owned database. */
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types';
import request from 'supertest';
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';
import { expectAuditReadback } from './support/expect-audit-readback';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createLotHistoryDatabaseApp,
  seedLotHistoryDatabase,
  HISTORY_SPECIMEN,
  HISTORY_EVENT,
  HISTORY_LOT,
  OTHER_HISTORY_SPECIMEN,
} from './support/lot-history-database-app';

describe('Historical lot enum compatibility on owned PostgreSQL', () => {
  let database: DisposableFaqPostgres;
  let app: INestApplication<App>;
  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('lot-history');
    await database.createRole('service_role');
    await seedLotHistoryDatabase(database.admin);
    app = await createLotHistoryDatabaseApp(database.url('service_role'));
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await database?.close();
    }
  });

  it('reads an existing TEMPORARY_ABSENCE through specimen history', async () => {
    const response = await request(app.getHttpServer())
      .get(`/specimens/${HISTORY_SPECIMEN}/lots/history`)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({
      total: 1,
      items: [
        {
          id: HISTORY_EVENT,
          adjustmentType: 'TEMPORARY_ABSENCE',
          reason: 'Synthetic retained history',
          quantityAffected: 1,
        },
      ],
    });
  });

  it('reads the same retained event through single-lot transactions', async () => {
    const response = await request(app.getHttpServer())
      .get(`/specimens/${HISTORY_SPECIMEN}/lots/${HISTORY_LOT}/transactions`)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({
      total: 1,
      items: [
        {
          id: HISTORY_EVENT,
          adjustmentType: 'TEMPORARY_ABSENCE',
          quantityAffected: 1,
        },
      ],
    });
  });

  it('does not expose that event under a different specimen', async () => {
    const response = await request(app.getHttpServer())
      .get(`/specimens/${OTHER_HISTORY_SPECIMEN}/lots/history`)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({ total: 0, items: [] });
    await request(app.getHttpServer())
      .get(
        `/specimens/${OTHER_HISTORY_SPECIMEN}/lots/${HISTORY_LOT}/transactions`,
      )
      .auth('curator-fixture', { type: 'bearer' })
      .expect(404);
  });

  it('keeps temporary-absence write commands disabled and preserves quantity/history', async () => {
    const rejected = await request(app.getHttpServer())
      .post(
        `/specimens/${HISTORY_SPECIMEN}/lots/${HISTORY_LOT}/quantity-adjustments`,
      )
      .auth('curator-fixture', { type: 'bearer' })
      .send({
        adjustmentType: 'TEMPORARY_ABSENCE',
        quantityDelta: -1,
        expectedQuantity: 4,
        reason: 'Synthetic unsupported write',
      })
      .expect(400);
    expect(JSON.stringify(rejected.body)).toContain(
      'adjustmentType must be one of',
    );
    const summary = await request(app.getHttpServer())
      .get(`/specimens/${HISTORY_SPECIMEN}/lots/summary`)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    expect(summary.body).toMatchObject({ totalQuantity: 4, activeLotCount: 1 });
    const history = await request(app.getHttpServer())
      .get(`/specimens/${HISTORY_SPECIMEN}/lots/history`)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    expect(history.body).toMatchObject({
      total: 1,
      items: [{ id: HISTORY_EVENT, reason: 'Synthetic retained history' }],
    });
  });

  it('retains history when the original idempotent migration is replayed in the owned fixture', async () => {
    const sql = readFileSync(
      resolve(
        __dirname,
        '../prisma/migrations/20261022000100_add_temporary_absence_adjustment/migration.sql',
      ),
      'utf8',
    );
    await database.admin.query(sql);
    await database.admin.query(sql);
    const response = await request(app.getHttpServer())
      .get(`/specimens/${HISTORY_SPECIMEN}/lots/history`)
      .auth('curator-fixture', { type: 'bearer' })
      .expect(200);
    expect(response.body).toMatchObject({
      total: 1,
      items: [{ id: HISTORY_EVENT, adjustmentType: 'TEMPORARY_ABSENCE' }],
    });
  });

  it('denies unauthenticated history access', async () => {
    await request(app.getHttpServer())
      .get(`/specimens/${HISTORY_SPECIMEN}/lots/history`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/specimens/${HISTORY_SPECIMEN}/lots/history`)
      .auth('invalid-fixture', { type: 'bearer' })
      .expect(401);
  });

  it('denies Developer history reads and retains the denial audit', async () => {
    const response = await request(app.getHttpServer())
      .get(`/specimens/${HISTORY_SPECIMEN}/lots/history`)
      .auth('developer-fixture', { type: 'bearer' })
      .expect(403);
    expect(JSON.stringify(response.body)).not.toContain(HISTORY_EVENT);
    await expectAuditReadback(app.getHttpServer(), {
      items: [
        expect.objectContaining({ action: 'ACCESS_DENIED', result: 'DENIED' }),
      ],
    });
  });
});
