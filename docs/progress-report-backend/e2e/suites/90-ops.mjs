// SRS 4.3 dashboard and notifications, 4.14 offline sync, 4.15 audit and backup,
// plus the public-exposure sweep for 4.10. Runs last: it reads what earlier
// suites created.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { api, auditRow, BASE, call, check, ids, info, one, section, sql, UNKNOWN_ID } from '../lib.mjs';

const draft = (extra = {}) => ({ commonName: 'Audit Offline', remarks: 'Audit draft', ...extra });

export default async function run() {
  section('4.3 Dashboard and notifications', ['REQ-4.3-01', 'REQ-4.3-02']);
  const summary = await call('dashboard summary', 'happy', 'curator', 'GET', '/dashboard/summary', 200);
  const text = JSON.stringify(summary.body);
  const counts = await sql("select status, count(*)::int n from specimen group by status");
  const n = (s) => counts.find((c) => c.status === s)?.n ?? 0;
  check('GET /dashboard/summary', 'shape', 'specimen status counts match the database', text.includes(`${n('UNCATALOGED')}`) && text.includes(`${n('CATALOGED')}`), { expected: counts, actual: summary.body?.specimens ?? Object.keys(summary.body ?? {}), srs: ['REQ-4.3-01'] });
  check('GET /dashboard/summary', 'shape', 'archived count shown', /archived/i.test(text), { expected: 'archived', actual: 'checked', srs: ['REQ-4.3-01'] });
  check('GET /dashboard/summary', 'shape', 'collection category breakdown shown', /categor/i.test(text), { expected: 'categories', actual: 'checked', srs: ['REQ-4.3-01'] });
  check('GET /dashboard/summary', 'shape', 'pending inquiries and visits shown', /inquir/i.test(text) && /visit/i.test(text), { expected: 'both', actual: Object.keys(summary.body ?? {}), srs: ['REQ-4.3-02'] });

  section('4.3 Dashboard and notifications', ['REQ-4.3-05', 'REQ-4.3-06']);
  await api('none', 'POST', '/inquiries', { json: { name: 'Audit Feed', email: 'feed@example.invalid', message: 'Audit feed inquiry private text', consentAccepted: true } });
  const feed = await call('notification feed', 'happy', 'curator', 'GET', '/notifications', 200);
  const items = feed.body?.items ?? [];
  check('GET /notifications', 'shape', 'new inquiry alert present', items.some((i) => /inquir/i.test(JSON.stringify(i))), { expected: 'inquiry item', actual: items.length });
  check('GET /notifications', 'shape', 'new visit alert present', items.some((i) => /visit/i.test(JSON.stringify(i))), { expected: 'visit item', actual: items.length });
  check('GET /notifications', 'shape', 'items hold no visitor detail', !/Audit feed inquiry private text|feed@example\.invalid/.test(JSON.stringify(items)), { expected: 'no private text', actual: items[0] ?? null, srs: ['REQ-4.3-08'] });
  check('GET /notifications', 'shape', 'items link to their record', items.length > 0 && items.every((i) => i.href || i.link || i.route || i.recordId || i.targetPath || i.path || i.url), { expected: 'target', actual: items[0] ?? null, srs: ['REQ-4.3-06'] });
  await call('limit validated', 'invalid', 'curator', 'GET', '/notifications', 400, { query: { limit: 0 } });
  await call('limit bound enforced', 'invalid', 'curator', 'GET', '/notifications', 400, { query: { limit: 100000 } });
  check('GET /notifications', 'shape', 'sync failure alert exists', /SYNC_FAIL|SYNC_DRAFT/.test(readFileSync(join(process.cwd(), 'src/notifications/notifications.service.ts'), 'utf8')), {
    expected: 'sync-failure source in feed', actual: 'feed sources: NEW_INQUIRY, NEW_VISIT_REQUEST, SUBMISSION_EMAIL_FAILED', srs: ['REQ-4.3-05'],
    note: 'SRS names sync failures; the frontend report also says the bell shows only those three.',
  });

  section('4.3 Dashboard and notifications', ['REQ-4.3-08']);
  await call('feed hidden from the public', 'no-jwt', 'none', 'GET', '/notifications', 401);

  section('4.3 Dashboard and notifications', ['REQ-4.3-07']);
  const target = items[0]?.id;
  const before = await one('select count(*)::int n from inquiry');
  await call('mark read', 'happy', 'curator', 'PATCH', '/notifications/state', 200, { json: { notificationId: target, state: 'READ' } });
  const state = await one('select * from user_notification_state where notification_id = $1 and user_account_id = $2', [target, ids.curator]);
  check('PATCH /notifications/state', 'db', 'read state stored per curator', Boolean(state?.read_at), { expected: 'read_at', actual: state ?? null });
  const again = await api('curator', 'GET', '/notifications');
  check('GET /notifications', 'shape', 'feed reflects read state', Boolean(again.body?.items?.find((i) => i.id === target)?.readAt), { expected: 'readAt', actual: again.body?.items?.find((i) => i.id === target) ?? null });
  const other = await api('curator2', 'GET', '/notifications');
  check('GET /notifications', 'shape', 'another curator still sees it unread', !other.body?.items?.find((i) => i.id === target)?.readAt, { expected: 'unread', actual: other.body?.items?.find((i) => i.id === target)?.readAt ?? null });
  await call('dismiss', 'happy', 'curator', 'PATCH', '/notifications/state', 200, { json: { notificationId: target, state: 'DISMISSED' } });
  const dismissed = await api('curator', 'GET', '/notifications');
  check('GET /notifications', 'shape', 'dismissed item leaves the feed', !dismissed.body?.items?.some((i) => i.id === target), { expected: 'gone', actual: dismissed.body?.items?.length });
  const after = await one('select count(*)::int n from inquiry');
  check('PATCH /notifications/state', 'db', 'underlying records untouched', before.n === after.n, { expected: before.n, actual: after.n });
  await call('bad state refused', 'invalid', 'curator', 'PATCH', '/notifications/state', 400, { json: { notificationId: target, state: 'NOPE' } });
  await call('unknown notification refused', 'invalid', 'curator', 'PATCH', '/notifications/state', [400, 404], { json: { notificationId: 'nope', state: 'READ' } });
  info('PATCH /notifications/state', 'feature is off unless NOTIFICATION_STATE_ENABLED=true', {
    expected: 'on where acceptance runs', actual: 'audit server sets it true; the local backend .env does not define it, so the route is disabled there by default',
  });

  section('4.3 Dashboard and notifications', ['REQ-4.3-10']);
  check('code', 'absence', 'internal events do not send email', !/mail/i.test(readFileSync(join(process.cwd(), 'src/offline-sync/offline-sync.service.ts'), 'utf8')), { expected: 'no mail in sync path', actual: 'checked' });

  // ---- Offline sync ---------------------------------------------------------
  section('4.14 Offline drafts and sync', ['REQ-4.14-06', 'REQ-4.14-03', 'REQ-4.14-04']);
  const client = randomUUID();
  const synced = await call('draft accepted', 'happy', 'curator', 'POST', '/offline-sync/specimen-drafts', 200, { json: { clientDraftId: client, draft: draft() } });
  const specimen = await one('select s.status from specimen s join offline_draft_sync o on o.specimen_id = s.id where o.client_draft_id = $1', [client]);
  check('POST /offline-sync/specimen-drafts', 'db', 'server record is UNCATALOGED', specimen?.status === 'UNCATALOGED', { expected: 'UNCATALOGED', actual: specimen ?? synced.body });
  const syncAudit = await auditRow('SYNC_OFFLINE_SPECIMEN_DRAFT', {});
  check('POST /offline-sync/specimen-drafts', 'db', 'sync audited', Boolean(syncAudit), { expected: 'audit', actual: syncAudit?.action ?? null, srs: ['REQ-4.15-01'] });

  section('4.14 Offline drafts and sync', ['REQ-4.14-08']);
  await call('same draft retried', 'happy', 'curator', 'POST', '/offline-sync/specimen-drafts', 200, { json: { clientDraftId: client, draft: draft() } });
  const copies = await one("select count(*)::int n from offline_draft_sync where client_draft_id = $1", [client]);
  const specimens = await one("select count(*)::int n from specimen where common_name = 'Audit Offline'");
  check('POST /offline-sync/specimen-drafts', 'db', 'retry creates no second record', copies.n === 1 && specimens.n === 1, { expected: 1, actual: { copies: copies.n, specimens: specimens.n } });
  await call('same id with different content conflicts', 'invalid', 'curator', 'POST', '/offline-sync/specimen-drafts', 409, { json: { clientDraftId: client, draft: draft({ commonName: 'Changed' }) } });
  await Promise.all([1, 2, 3].map(() => api('curator', 'POST', '/offline-sync/specimen-drafts', { json: { clientDraftId: ids.parallel ??= randomUUID(), draft: draft({ commonName: 'Audit Parallel' }) } })));
  const parallel = await one("select count(*)::int n from specimen where common_name = 'Audit Parallel'");
  check('POST /offline-sync/specimen-drafts', 'db', 'concurrent retries create one record', parallel.n === 1, { expected: 1, actual: parallel.n });

  section('4.14 Offline drafts and sync', ['REQ-4.14-07', 'REQ-4.14-11']);
  await call('malformed client id refused', 'invalid', 'curator', 'POST', '/offline-sync/specimen-drafts', 400, { json: { clientDraftId: 'x', draft: draft() } });
  await call('missing draft refused', 'invalid', 'curator', 'POST', '/offline-sync/specimen-drafts', 400, { json: { clientDraftId: randomUUID() } });
  await call('invalid value refused', 'invalid', 'curator', 'POST', '/offline-sync/specimen-drafts', 400, { json: { clientDraftId: randomUUID(), draft: draft({ gender: 'ROBOT' }) } });
  await call('non-text field refused', 'invalid', 'curator', 'POST', '/offline-sync/specimen-drafts', 400, { json: { clientDraftId: randomUUID(), draft: draft({ status: 'CATALOGED' }) } });
  await call('lot data refused', 'invalid', 'curator', 'POST', '/offline-sync/specimen-drafts', 400, { json: { clientDraftId: randomUUID(), draft: draft({ quantity: 5 }) } });
  await call('taken accession refused with a reason', 'invalid', 'curator', 'POST', '/offline-sync/specimen-drafts', 409, { json: { clientDraftId: randomUUID(), draft: draft({ accessionNumber: 'AUD-0001' }) } });

  // ---- Audit ---------------------------------------------------------------
  section('4.15 Audit, backup and recovery', ['REQ-4.15-04', 'REQ-4.15-02']);
  const logs = await call('audit list', 'happy', 'curator', 'GET', '/audit-logs', 200);
  const first = (logs.body?.items ?? logs.body?.data ?? [])[0];
  check('GET /audit-logs', 'shape', 'entry has actor, action, record, time, result', Boolean(first?.action && (first?.createdAt || first?.timestamp) && (first?.result || first?.status)), { expected: 'fields', actual: first ?? null, srs: ['REQ-4.15-02'] });
  await call('filter by module', 'happy', 'curator', 'GET', '/audit-logs', 200, { query: { module: 'specimens', result: 'SUCCESS' } });
  await call('filter by action and date', 'happy', 'curator', 'GET', '/audit-logs', 200, { query: { action: 'LOGIN', from: '2026-01-01T00:00:00Z', to: '2026-12-31T23:59:59Z' } });
  await call('search', 'happy', 'curator', 'GET', '/audit-logs', 200, { query: { search: 'specimen' } });
  await call('bad result refused', 'invalid', 'curator', 'GET', '/audit-logs', 400, { query: { result: 'NOPE' } });
  await call('bad page refused', 'invalid', 'curator', 'GET', '/audit-logs', 400, { query: { page: 0 } });
  await call('bad date refused', 'invalid', 'curator', 'GET', '/audit-logs', 400, { query: { from: 'x' } });
  await call('read entry', 'happy', 'curator', 'GET', `/audit-logs/${first?.id}`, 200, { op: '/audit-logs/:id' });
  await call('unknown entry is 404', 'invalid', 'curator', 'GET', `/audit-logs/${UNKNOWN_ID}`, 404, { op: '/audit-logs/:id' });

  section('4.15 Audit, backup and recovery', ['REQ-4.15-03']);
  const edit = await api('curator', 'PATCH', `/audit-logs/${first?.id}`, { json: { action: 'X' } });
  const remove = await api('curator', 'DELETE', `/audit-logs/${first?.id}`);
  check('PATCH /audit-logs/:id', 'absence', 'no edit route', edit.status === 404, { expected: 404, actual: edit.status });
  check('DELETE /audit-logs/:id', 'absence', 'no delete route', remove.status === 404, { expected: 404, actual: remove.status });

  section('4.15 Audit, backup and recovery', ['REQ-4.15-01']);
  const actions = new Set((await sql('select distinct action from audit_log')).map((r) => r.action));
  for (const action of ['LOGIN', 'CREATE_SPECIMEN', 'UPDATE_SPECIMEN', 'IMPORT_SPECIMEN', 'ARCHIVE_SPECIMEN', 'ADJUST_SPECIMEN_LOT_QUANTITY', 'UPDATE_INQUIRY_STATUS', 'UPDATE_VISIT_REQUEST_STATUS', 'CREATE_FAQ_ENTRY', 'PUBLISH_EXHIBIT', 'CREATE_AR_ASSET', 'GENERATE_REPORT']) {
    check('audit coverage', 'db', `${action} present`, actions.has(action), { expected: action, actual: actions.has(action) });
  }
  const lotAudits = [...actions].filter((a) => /LOT/.test(a));
  check('audit coverage', 'db', 'lot movement and split/merge audited', lotAudits.some((a) => /MOVE|TRANSFER|SPLIT|MERGE/.test(a)), { expected: 'move action', actual: lotAudits, note: 'Lots keep a transaction ledger; this asks whether audit_log has the movement.' });
  check('audit coverage', 'absence', 'backup results audited', [...actions].some((a) => /BACKUP/.test(a)), { expected: 'backup audit', actual: 'none: backend never runs a backup' });
  check('audit coverage', 'absence', 'restoration audited', [...actions].some((a) => /RESTORE_BACKUP|RESTORATION/.test(a)), { expected: 'restore audit', actual: 'none', srs: ['REQ-4.15-01', 'REQ-4.15-09'] });

  // ---- Backup ---------------------------------------------------------------
  section('4.15 Audit, backup and recovery', ['REQ-4.15-06']);
  await sql("insert into backup_history(id, created_by, backup_type, storage_path, status, started_at, completed_at) select gen_random_uuid(), $1, 'FULL', 'audit/path', 'FAILED', now(), now()", [ids.curator]).catch(() => null);
  const hist = await call('history list', 'happy', 'curator', 'GET', '/backups/history', 200);
  const row = (hist.body?.items ?? hist.body?.data ?? [])[0];
  await call('filter', 'happy', 'curator', 'GET', '/backups/history', 200, { query: { from: '2026-01-01T00:00:00Z' } });
  await call('bad status refused', 'invalid', 'curator', 'GET', '/backups/history', 400, { query: { status: 'NOPE' } });
  await call('bad date refused', 'invalid', 'curator', 'GET', '/backups/history', 400, { query: { from: 'x' } });
  if (row?.id) {
    await call('read one', 'happy', 'curator', 'GET', `/backups/history/${row.id}`, 200, { op: '/backups/history/:id' });
    check('GET /backups/history', 'shape', 'internal storage path hidden', !JSON.stringify(row).includes('audit/path'), { expected: 'no path', actual: row, srs: ['REQ-4.15-07'] });
  } else {
    info('GET /backups/history/:id', 'read a history row', { expected: 'row', actual: 'fixture row not created; enum values differ' });
  }
  await call('unknown is 404', 'invalid', 'curator', 'GET', `/backups/history/${UNKNOWN_ID}`, 404, { op: '/backups/history/:id' });
  check('code', 'absence', 'failed backup notifies the operator', false, { expected: 'alert', actual: 'no writer or alert in repo; history is read-only', srs: ['REQ-4.15-06'] });
  section('4.15 Audit, backup and recovery', ['REQ-4.15-05']);
  const start = await api('curator', 'POST', '/backups', { json: {} });
  check('POST /backups', 'absence', 'backup can be scheduled or started', start.status < 400, { expected: 'job or schedule', actual: start.status, note: 'No backup job, script or cron in the repo.' });
  section('4.15 Audit, backup and recovery', ['REQ-4.15-08', 'REQ-4.15-09']);
  const restore = await api('curator', 'POST', '/backups/restore', { json: {} });
  check('POST /backups/restore', 'absence', 'approved restore procedure available', restore.status < 400, { expected: 'procedure', actual: restore.status });
  section('4.15 Audit, backup and recovery', ['REQ-4.15-10']);
  check('routes', 'absence', 'no general admin dashboard needed', true, { expected: 'none', actual: 'backup surface is read-only history' });
  section('4.15 Audit, backup and recovery', ['REQ-4.15-11']);
  check('docs', 'absence', 'full backup-and-restore test documented', false, { expected: 'completed test', actual: 'BAK-002 Deferred in the acceptance plan' });
  section('4.15 Audit, backup and recovery', ['REQ-4.15-12']);
  check('docs', 'absence', 'schedule, retention and operator approved', false, { expected: 'USC/DCISM approval', actual: 'none recorded' });
  section('4.15 Audit, backup and recovery', ['REQ-4.15-07']);
  info('deployment', 'backup encryption and access', { expected: 'deployment control', actual: 'no backups exist in the repo to examine' });

  // ---- Public exposure sweep ------------------------------------------------
  section('4.10 Public website', ['REQ-4.10-08', 'REQ-4.8-10', 'REQ-4.9-15']);
  const pub = await call('root status', 'happy', 'none', 'GET', '/', 200);
  check('GET /', 'shape', 'root exposes no internals', !/DATABASE|SUPABASE|password/i.test(pub.text), { expected: 'clean', actual: pub.text.slice(0, 80) });
  for (const path of ['/inquiries', '/visit-requests', '/audit-logs', '/user-accounts', '/specimens', '/storage-locations', '/exhibits', '/reports', '/faq/entries', '/backups/history', '/dashboard/summary']) {
    await call(`${path} closed to the public`, 'no-jwt', 'none', 'GET', path, 401);
  }
  const docs = await api('none', 'GET', '/docs');
  info('GET /docs', 'Swagger UI is public', { expected: 'decide for production', actual: docs.status, note: 'main.ts mounts it unconditionally; it lists every route to anonymous users.' });
  void BASE;

  section('4.9 Visit requests', ['REQ-4.9-13']);
  const logPath = join(process.env.AUDIT_RUN_DIR ?? join(tmpdir(), 'biosphere-srs-audit'), 'egress.log');
  const egress = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
  check('egress', 'db', 'server attempted no outbound host other than the mail sink', !/BLOCKED/.test(egress), { expected: 'no BLOCKED lines', actual: egress.split('\n').filter((l) => /BLOCKED/.test(l)).slice(0, 5) });
}
