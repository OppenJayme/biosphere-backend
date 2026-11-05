/**
 * Acceptance tests for change-event and incomplete-record notifications
 * (REQ-4.3-10; team decision 2026-11-06). Opt-in, like the progress-report
 * live suite: the real AppModule runs against a disposable local PostgreSQL
 * built from prisma/migrations, with Supabase faked on loopback and email
 * captured. Events are triggered through the real HTTP endpoints, so the
 * audit rows come from the actual services.
 *
 * Run (Node 22, local Docker):
 * RUN_PROGRESS_API_LIVE=true node --experimental-vm-modules node_modules/jest/bin/jest.js --config ./test/jest-notifications-live.json --runInBand
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DisposableAppDatabase } from './support/progress-api-live/disposable-app-database';
import {
  FakeSupabase,
  installOutboundGuard,
} from './support/progress-api-live/fake-supabase';

jest.setTimeout(300_000);

type FeedItem = { id: string; type: string; recordId: string };
type Feed = {
  items: FeedItem[];
  changeEvents: number;
  incompleteRecords: number;
};

let app: INestApplication<App>;
let db: DisposableAppDatabase;
let fake: FakeSupabase;
let outbound: ReturnType<typeof installOutboundGuard>;
const token: Record<'A' | 'B', string> = { A: '', B: '' };
const account: Record<'A' | 'B', string> = { A: '', B: '' };

// Returns the supertest request itself (not a promise) so callers can chain .expect().
function call(
  who: 'A' | 'B',
  method: 'get' | 'post' | 'patch',
  path: string,
  body?: object,
): request.Test {
  const server = app.getHttpServer();
  const req = request(server)
    [method](path)
    .set('Authorization', `Bearer ${token[who]}`);
  return body ? req.send(body) : req;
}

function idOf(res: { body: unknown }): string {
  return (res.body as { id: string }).id;
}

async function feed(who: 'A' | 'B'): Promise<Feed> {
  const res = await call(who, 'get', '/notifications?limit=100').expect(200);
  return res.body as Feed;
}

function ofType(body: Feed, type: string) {
  return body.items.filter((item) => item.type === type);
}

beforeAll(async () => {
  outbound = installOutboundGuard();
  db = await DisposableAppDatabase.start();
  fake = new FakeSupabase(db.admin);
  await fake.start();
  // Every key the app reads is pinned locally, so nothing falls back to .env.
  Object.assign(process.env, {
    NODE_ENV: 'development',
    DATABASE_URL: db.url(),
    DIRECT_URL: db.url(),
    SUPABASE_URL: fake.baseUrl,
    SUPABASE_SECRET_KEY: 'fake-service-role-key',
    SUPABASE_ANON_KEY: 'fake-anon-key',
    BREVO_API_KEY: 'fake-brevo-key',
    MAIL_FROM_EMAIL: 'museum@example.test',
    MAIL_FROM_NAME: 'USC Biological Museum',
    FRONTEND_URL: 'http://localhost:3000',
    PUBLIC_SITE_URL: 'http://localhost:3000',
    CURATOR_ALERT_EMAILS: '',
    NOTIFICATION_STATE_ENABLED: 'true',
    FAQ_REVIEW_ENABLED: '',
  });
  for (const who of ['A', 'B'] as const) {
    const authId = randomUUID();
    account[who] = randomUUID();
    await db.admin.query(
      `INSERT INTO auth.users (id, email, encrypted_password, raw_app_meta_data, created_at, updated_at)
       VALUES ($1, $2, 'bcrypt-placeholder', '{}'::jsonb, now(), now())`,
      [authId, `curator-${who.toLowerCase()}@example.test`],
    );
    await db.admin.query(
      `INSERT INTO user_account (id, auth_user_id, full_name, role, status)
       VALUES ($1, $2, $3, 'CURATOR', 'ACTIVE')`,
      [account[who], authId, `Synthetic curator ${who}`],
    );
    token[who] = fake.addUser({
      id: authId,
      email: `curator-${who.toLowerCase()}@example.test`,
      app_metadata: {},
      user_metadata: {},
    });
  }
  // Loaded only now, after the environment above is pinned.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../src/app.module') as {
    AppModule: new () => unknown;
  };
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  if (
    !app.get(ConfigService).get<string>('DATABASE_URL')?.includes('@127.0.0.1:')
  )
    throw new Error('Refusing to run: not the disposable local database');
});

afterAll(async () => {
  await app?.close();
  await fake?.stop();
  await db?.close();
  outbound?.restore();
});

describe('Change-event notifications (archive/restore, lot moves, deaccession/loss)', () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const unit = async (
      label: string,
      parentId: string | null,
      holds: boolean,
    ) =>
      idOf(
        await call('A', 'post', '/storage-locations', {
          label,
          unitType: holds ? 'DRAWER' : 'ROOM',
          storageType: 'DRY',
          parentId,
          holdsSpecimens: holds,
        }).expect(201),
      );
    ids.room = await unit('Room', null, false);
    ids.drawer1 = await unit('Drawer 1', ids.room, true);
    ids.drawer2 = await unit('Drawer 2', ids.room, true);

    ids.withLot = idOf(
      await call('A', 'post', '/specimens', {
        commonName: 'Lot specimen',
      }).expect(201),
    );
    ids.lot = idOf(
      await call('A', 'post', `/specimens/${ids.withLot}/lots`, {
        storageUnitId: ids.drawer1,
        conditionClass: 'Good',
        quantity: 10,
      }).expect(201),
    );
    ids.archivable = idOf(
      await call('A', 'post', '/specimens', {
        commonName: 'Archive me',
      }).expect(201),
    );

    // Significant operations by curator A.
    await call(
      'A',
      'post',
      `/specimens/${ids.withLot}/lots/${ids.lot}/movements`,
      {
        targetStorageUnitId: ids.drawer2,
        quantity: 2,
        reason: 'Study',
      },
    ).expect((res) => expect([200, 201]).toContain(res.status));
    for (const [adjustmentType, expectedQuantity] of [
      ['DEACCESSION', 8],
      ['MISSING_LOSS', 7],
    ] as const) {
      await call(
        'A',
        'post',
        `/specimens/${ids.withLot}/lots/${ids.lot}/quantity-adjustments`,
        {
          adjustmentType,
          quantityDelta: -1,
          expectedQuantity,
          reason: `${adjustmentType} test`,
        },
      ).expect((res) => expect([200, 201]).toContain(res.status));
    }
    await call('A', 'patch', `/specimens/${ids.archivable}/archive`).expect(
      200,
    );
    await call('A', 'patch', `/specimens/${ids.archivable}/restore`).expect(
      200,
    );

    // Routine operations by curator A that must stay audit-only.
    await call(
      'A',
      'post',
      `/specimens/${ids.withLot}/lots/${ids.lot}/quantity-adjustments`,
      {
        adjustmentType: 'ADDITION',
        quantityDelta: 1,
        expectedQuantity: 6,
        reason: 'Found',
      },
    ).expect((res) => expect([200, 201]).toContain(res.status));
    await call(
      'A',
      'post',
      `/specimens/${ids.withLot}/lots/${ids.lot}/condition-changes`,
      {
        targetConditionClass: 'Fair',
        quantity: 1,
        reason: 'Wear',
      },
    ).expect((res) => expect([200, 201]).toContain(res.status));
    await call('A', 'patch', `/specimens/${ids.withLot}`, {
      remarks: 'Routine edit',
    }).expect(200);
  });

  it('notifies another curator exactly once per significant event', async () => {
    const body = await feed('B');

    for (const type of [
      'LOT_MOVED',
      'LOT_DEACCESSIONED',
      'LOT_MISSING_LOSS',
      'SPECIMEN_ARCHIVED',
      'SPECIMEN_RESTORED',
    ])
      expect(ofType(body, type)).toHaveLength(1);
    expect(body.changeEvents).toBe(5);
    expect(ofType(body, 'LOT_MOVED')[0].recordId).toBe(ids.withLot);
    expect(ofType(body, 'SPECIMEN_ARCHIVED')[0].recordId).toBe(ids.archivable);
  });

  it('keeps routine edits, additions and condition changes audit-only', async () => {
    const routine = await db.admin.query(
      `SELECT count(*)::int AS n FROM audit_log WHERE status = 'SUCCESS' AND user_id = $1
       AND action IN ('UPDATE_SPECIMEN','CHANGE_SPECIMEN_LOT_CONDITION')`,
      [account.A],
    );
    // The routine operations were audited ...
    expect(routine.rows[0].n).toBeGreaterThanOrEqual(2);
    // ... but raised no alert beyond the five significant events.
    expect((await feed('B')).changeEvents).toBe(5);
  });

  it('never notifies the curator who made the change', async () => {
    const body = await feed('A');

    expect(body.changeEvents).toBe(0);
  });

  it('drops change events older than 7 calendar days but keeps recent ones', async () => {
    await db.admin.query(
      `UPDATE audit_log SET created_at = now() - INTERVAL '8 days'
       WHERE action = 'ARCHIVE_SPECIMEN' AND affected_record_id = $1`,
      [ids.archivable],
    );
    await db.admin.query(
      `UPDATE audit_log SET created_at = now() - INTERVAL '6 days'
       WHERE action = 'RESTORE_SPECIMEN' AND affected_record_id = $1`,
      [ids.archivable],
    );

    const body = await feed('B');

    expect(ofType(body, 'SPECIMEN_ARCHIVED')).toHaveLength(0);
    expect(ofType(body, 'SPECIMEN_RESTORED')).toHaveLength(1);
    expect(body.changeEvents).toBe(4);
  });

  it('lets the recipient mark a change event read and dismissed', async () => {
    const moved = ofType(await feed('B'), 'LOT_MOVED')[0];

    await call('B', 'patch', '/notifications/state', {
      notificationId: moved.id,
      state: 'DISMISSED',
    }).expect(200);

    expect(ofType(await feed('B'), 'LOT_MOVED')).toHaveLength(0);
  });
});

describe('Incomplete-record notifications (Uncataloged for more than 7 days)', () => {
  const ids: Record<string, string> = {};

  async function backdate(specimenId: string, days: number) {
    await db.admin.query(
      `UPDATE specimen SET created_at = now() - make_interval(days => $2) WHERE id = $1`,
      [specimenId, days],
    );
  }

  beforeAll(async () => {
    ids.collection = idOf(
      await call('A', 'post', '/collections', {
        collectionName: 'Overdue checks',
      }).expect(201),
    );
    ids.drawer = idOf(
      await call('A', 'post', '/storage-locations', {
        label: 'Overdue drawer',
        unitType: 'DRAWER',
        storageType: 'DRY',
        holdsSpecimens: true,
      }).expect(201),
    );
    const specimen = async (commonName: string) =>
      idOf(await call('A', 'post', '/specimens', { commonName }).expect(201));
    ids.overdue = await specimen('Overdue record');
    ids.recent = await specimen('Recent record');
    ids.archived = await specimen('Archived old record');
    await backdate(ids.overdue, 9);
    await backdate(ids.recent, 5);
    await backdate(ids.archived, 30);
    await call('A', 'patch', `/specimens/${ids.archived}/archive`).expect(200);
  });

  it('flags only active records Uncataloged for more than 7 days, for every curator', async () => {
    for (const who of ['A', 'B'] as const) {
      const body = await feed(who);
      const flagged = ofType(body, 'RECORD_INCOMPLETE').map(
        (item) => item.recordId,
      );
      expect(flagged).toContain(ids.overdue);
      expect(flagged).not.toContain(ids.recent);
      expect(flagged).not.toContain(ids.archived);
    }
    ids.firstKey = ofType(await feed('B'), 'RECORD_INCOMPLETE').find(
      (item) => item.recordId === ids.overdue,
    )!.id;
  });

  it('resolves automatically once the record is cataloged', async () => {
    await call('A', 'patch', `/specimens/${ids.overdue}`, {
      collectionId: ids.collection,
      accessionNumber: 'USC-BM-OVERDUE-1',
    }).expect(200);
    await call('A', 'post', `/specimens/${ids.overdue}/taxonomy`, {
      kingdom: 'Animalia',
    }).expect(201);
    await call('A', 'post', `/specimens/${ids.overdue}/provenance`, {
      collectionDate: '2020-01-01',
      preservationType: 'Skin',
      preservationMethod: 'Dry',
    }).expect(201);
    await call('A', 'post', `/specimens/${ids.overdue}/lots`, {
      storageUnitId: ids.drawer,
      conditionClass: 'Good',
      quantity: 1,
    }).expect(201);
    await call(
      'A',
      'patch',
      `/specimens/${ids.overdue}/complete-cataloging`,
    ).expect(200);

    const flagged = ofType(await feed('B'), 'RECORD_INCOMPLETE').map(
      (item) => item.recordId,
    );
    expect(flagged).not.toContain(ids.overdue);
  });

  it('starts a new period on reopen, with a new key, after another 7 days', async () => {
    await call('A', 'patch', `/specimens/${ids.overdue}/reopen-cataloging`, {
      reason: 'Correct taxonomy',
    }).expect(200);
    // Reopened just now: not overdue, even though the record itself is old.
    expect(
      ofType(await feed('B'), 'RECORD_INCOMPLETE').map((item) => item.recordId),
    ).not.toContain(ids.overdue);

    await db.admin.query(
      `UPDATE audit_log SET created_at = now() - INTERVAL '9 days'
       WHERE action = 'REOPEN_SPECIMEN_CATALOGING' AND affected_record_id = $1`,
      [ids.overdue],
    );
    const reopened = ofType(await feed('B'), 'RECORD_INCOMPLETE').find(
      (item) => item.recordId === ids.overdue,
    );
    expect(reopened).toBeDefined();
    // A dismissal of the first period's key cannot hide the new period.
    expect(reopened!.id).not.toBe(ids.firstKey);
  });

  it('keeps the outbound guard clean', () => {
    expect(outbound.blocked).toEqual([]);
  });
});
