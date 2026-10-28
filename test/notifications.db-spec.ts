import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
type Feed = { items: Array<{ id: string; readAt: string | null }> };
import { DisposableFaqPostgres } from './support/disposable-faq-postgres';
import {
  createNotificationsDatabaseApp,
  seedNotificationsDatabase,
  INQUIRY_ID,
  VISIT_ID,
  FAILURE_ID,
} from './support/notifications-database-app';

describe('Per-curator notification state, owned PostgreSQL and real HTTP', () => {
  let database: DisposableFaqPostgres;
  let app: INestApplication<App>;
  beforeAll(async () => {
    database = await DisposableFaqPostgres.start('notifications');
    await database.createRole('service_role');
    await seedNotificationsDatabase(database.admin);
    app = await createNotificationsDatabaseApp(database.url('service_role'));
  });
  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      await database?.close();
    }
  });
  beforeEach(async () => {
    await database.admin.query(
      'TRUNCATE user_notification_state, audit_log, visit_request, inquiry CASCADE',
    );
    await database.admin.query("UPDATE user_account SET status = 'ACTIVE'");
    await database.admin.query(
      `INSERT INTO inquiry(id,full_name,email_address,inquiry_type,message)
      VALUES ($1,'Synthetic Visitor','visitor@example.invalid','GENERAL','Synthetic question')`,
      [INQUIRY_ID],
    );
    await database.admin.query(
      `INSERT INTO visit_request(id,contact_person,email_address,contact_number,
      organization_name,visitor_count,consent_accepted_at) VALUES ($1,'Synthetic Visitor',
      'visitor@example.invalid','0000000000','Synthetic group',1,NOW())`,
      [VISIT_ID],
    );
    await database.admin.query(
      `INSERT INTO audit_log(id,affected_record_id,affected_record_type,action,module,status)
      VALUES ($1,$2,'inquiry','EMAIL_SUBMISSION_RECEIPT','inquiries','FAILED')`,
      [FAILURE_ID, INQUIRY_ID],
    );
  });
  function feed(token = 'curator-fixture', limit = 20) {
    return request(app.getHttpServer())
      .get('/notifications')
      .query({ limit })
      .auth(token, { type: 'bearer' });
  }
  function change(
    notificationId: string,
    state: string,
    token = 'curator-fixture',
    extra = {},
  ) {
    return request(app.getHttpServer())
      .patch('/notifications/state')
      .auth(token, { type: 'bearer' })
      .send({ notificationId, state, ...extra });
  }
  it('persists read state for the acting curator without clearing pending work or another curator alerts', async () => {
    const initial = (await feed().expect(200)).body as Feed;
    expect(initial).toMatchObject({
      total: 3,
      unreadTotal: 3,
      stateManagementEnabled: true,
      pendingInquiries: 1,
      pendingVisitRequests: 1,
    });
    await change('NEW_INQUIRY:' + INQUIRY_ID, 'READ').expect(200);
    const reloaded = (await feed().expect(200)).body as Feed;
    expect(reloaded).toMatchObject({
      total: 3,
      unreadTotal: 2,
      pendingInquiries: 1,
    });
    expect(
      reloaded.items.find(
        (item: { id: string }) => item.id === 'NEW_INQUIRY:' + INQUIRY_ID,
      )?.readAt,
    ).toBeTruthy();
    await change('NEW_INQUIRY:' + INQUIRY_ID, 'READ').expect(200);
    expect(
      ((await feed().expect(200)).body as Feed).items.find(
        (item: { id: string }) => item.id === 'NEW_INQUIRY:' + INQUIRY_ID,
      )?.readAt,
    ).toBe(
      reloaded.items.find(
        (item: { id: string }) => item.id === 'NEW_INQUIRY:' + INQUIRY_ID,
      )?.readAt,
    );
    expect(
      (await feed('other-curator-fixture').expect(200)).body.unreadTotal,
    ).toBe(3);
  });
  it('dismisses once, preserves first timestamps on retries and never changes source records', async () => {
    const key = 'NEW_VISIT_REQUEST:' + VISIT_ID;
    const before = await database.admin.query(
      'SELECT row_to_json(v) AS value FROM visit_request v',
    );
    const auditBefore = await database.admin.query(
      'SELECT row_to_json(a) AS value FROM audit_log a ORDER BY id',
    );
    await change(key, 'DISMISSED').expect(200);
    const first = (
      await database.admin.query('SELECT * FROM user_notification_state')
    ).rows;
    await change(key, 'DISMISSED').expect(200);
    await change(key, 'READ').expect(200);
    expect(
      (await database.admin.query('SELECT * FROM user_notification_state'))
        .rows,
    ).toEqual(first);
    expect((await feed().expect(200)).body).toMatchObject({
      total: 2,
      unreadTotal: 2,
      pendingVisitRequests: 1,
    });
    expect((await feed('other-curator-fixture').expect(200)).body.total).toBe(
      3,
    );
    expect(
      (
        await database.admin.query(
          'SELECT row_to_json(v) AS value FROM visit_request v',
        )
      ).rows,
    ).toEqual(before.rows);
    expect(
      (
        await database.admin.query(
          'SELECT row_to_json(a) AS value FROM audit_log a ORDER BY id',
        )
      ).rows,
    ).toEqual(auditBefore.rows);
  });
  it('keeps a later failure distinct after the same record previous failure was dismissed', async () => {
    await change('SUBMISSION_EMAIL_FAILED:' + FAILURE_ID, 'DISMISSED').expect(
      200,
    );
    const next = '88888888-8888-4888-8888-888888888888';
    await database.admin.query(
      `INSERT INTO audit_log(id,affected_record_id,affected_record_type,action,module,status)
      VALUES ($1,$2,'inquiry','EMAIL_SUBMISSION_RECEIPT','inquiries','FAILED')`,
      [next, INQUIRY_ID],
    );
    const all = (await feed().expect(200)).body as Feed;
    expect(all.items.map((item: { id: string }) => item.id)).toContain(
      'SUBMISSION_EMAIL_FAILED:' + next,
    );
    expect(all.items.map((item: { id: string }) => item.id)).not.toContain(
      'SUBMISSION_EMAIL_FAILED:' + FAILURE_ID,
    );
    const limited = (await feed('curator-fixture', 1).expect(200)).body as Feed;
    expect(limited).toMatchObject({
      total: 3,
      unreadTotal: 3,
      pendingInquiries: 1,
      pendingVisitRequests: 1,
      emailFailures: 2,
    });
    expect(limited.items).toHaveLength(1);
  });
  it('rejects unknown keys, invalid state and injected recipient fields without creating state', async () => {
    await change(
      'NEW_INQUIRY:99999999-9999-4999-8999-999999999999',
      'READ',
    ).expect(404);
    await change('NEW_INQUIRY:' + INQUIRY_ID, 'UNREAD').expect(400);
    await change('NEW_INQUIRY:' + INQUIRY_ID, 'READ', 'curator-fixture', {
      userAccountId: '33333333-3333-4333-8333-333333333333',
    }).expect(400);
    expect((await feed().expect(200)).body.unreadTotal).toBe(3);
    expect(
      (await database.admin.query('SELECT * FROM user_notification_state'))
        .rows,
    ).toEqual([]);
  });
  it('denies signed-out, Developer and inactive accounts at the real guards', async () => {
    await request(app.getHttpServer()).get('/notifications').expect(401);
    await request(app.getHttpServer())
      .patch('/notifications/state')
      .send({})
      .expect(401);
    await feed('developer-fixture').expect(403);
    await change(
      'NEW_INQUIRY:' + INQUIRY_ID,
      'READ',
      'developer-fixture',
    ).expect(403);
    await database.admin.query(
      "UPDATE user_account SET status = 'INACTIVE' WHERE id = '33333333-3333-4333-8333-333333333333'",
    );
    await feed('other-curator-fixture').expect(403);
    expect(
      (await database.admin.query('SELECT * FROM user_notification_state'))
        .rows,
    ).toEqual([]);
  });
  it('works with the feature disabled even when the state table is unavailable', async () => {
    const disabled = await createNotificationsDatabaseApp(
      database.url('service_role'),
      false,
    );
    await database.admin.query(
      'ALTER TABLE user_notification_state RENAME TO fixture_hidden_state',
    );
    try {
      const old = await request(disabled.getHttpServer())
        .get('/notifications')
        .auth('curator-fixture', { type: 'bearer' })
        .expect(200);
      expect(old.body).toMatchObject({ total: 3 });
      expect(old.body.stateManagementEnabled).toBeUndefined();
      await request(disabled.getHttpServer())
        .patch('/notifications/state')
        .auth('curator-fixture', { type: 'bearer' })
        .send({ notificationId: 'NEW_INQUIRY:' + INQUIRY_ID, state: 'READ' })
        .expect(503);
    } finally {
      await database.admin.query(
        'ALTER TABLE fixture_hidden_state RENAME TO user_notification_state',
      );
      await disabled.close();
    }
  });
  it('keeps a failed state write retryable without changing its authoritative counts', async () => {
    await database.admin.query(
      'REVOKE INSERT ON user_notification_state FROM service_role',
    );
    try {
      const failure = await change('NEW_INQUIRY:' + INQUIRY_ID, 'READ').expect(
        500,
      );
      expect(JSON.stringify(failure.body)).not.toContain(
        'user_notification_state',
      );
      expect((await feed().expect(200)).body.unreadTotal).toBe(3);
    } finally {
      await database.admin.query(
        'GRANT INSERT ON user_notification_state TO service_role',
      );
    }
    await change('NEW_INQUIRY:' + INQUIRY_ID, 'READ').expect(200);
    expect((await feed().expect(200)).body.unreadTotal).toBe(2);
  });
  it('enforces recipient uniqueness, key constraints and fail-closed client RLS in PostgreSQL', async () => {
    await change('NEW_INQUIRY:' + INQUIRY_ID, 'READ').expect(200);
    await expect(
      database.admin.query(
        `INSERT INTO user_notification_state(user_account_id,notification_id)
      VALUES ('11111111-1111-4111-8111-111111111111',$1)`,
        ['NEW_INQUIRY:' + INQUIRY_ID],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      database.admin
        .query(`INSERT INTO user_notification_state(user_account_id,notification_id)
      VALUES ('11111111-1111-4111-8111-111111111111','invalid')`),
    ).rejects.toMatchObject({ code: '23514' });
    const acl = await database.admin.query(
      "SELECT has_table_privilege('authenticated','user_notification_state','SELECT') AS allowed",
    );
    expect(acl.rows[0].allowed).toBe(false);
    await database.admin.query(
      'GRANT USAGE ON SCHEMA public TO authenticated; GRANT SELECT,INSERT ON user_notification_state TO authenticated',
    );
    try {
      await database.admin.query('BEGIN; SET LOCAL ROLE authenticated');
      expect(
        (await database.admin.query('SELECT * FROM user_notification_state'))
          .rows,
      ).toEqual([]);
      await expect(
        database.admin.query(
          `INSERT INTO user_notification_state(user_account_id,notification_id)
        VALUES ('33333333-3333-4333-8333-333333333333',$1)`,
          ['NEW_INQUIRY:' + INQUIRY_ID],
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await database.admin.query(
        'ROLLBACK; REVOKE ALL ON user_notification_state FROM authenticated',
      );
    }
  });
});
