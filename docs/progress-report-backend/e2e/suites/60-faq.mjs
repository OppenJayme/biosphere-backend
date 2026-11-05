// SRS 4.11 FAQ knowledge and the public assistant.
import { randomUUID } from 'node:crypto';
import { api, auditRow, call, check, ids, one, section, sql, UNKNOWN_ID } from '../lib.mjs';

export default async function run() {
  section('4.11 FAQ assistant', ['REQ-4.11-02', 'REQ-4.11-03']);
  const made = await call('create entry', 'happy', 'curator', 'POST', '/faq/entries', 201, {
    json: { question: 'What are the audit museum hours?', answer: 'Audit answer: nine to five.', alternativeWording: ['When is the audit museum open?'], keywords: ['audit', 'hours'], category: 'Visiting' },
  });
  ids.faq = made.body?.id;
  const row = await one('select * from faq_entry where id = $1', [ids.faq]);
  check('POST /faq/entries', 'db', 'entry stored with alternatives, keywords, category', row?.category === 'Visiting' && JSON.stringify(row).includes('When is the audit museum open?') && row?.created_by === ids.curator, { expected: 'row', actual: row ?? null });
  check('POST /faq/entries', 'db', 'new entry starts inactive', row?.status !== 'ACTIVE', { expected: 'not ACTIVE', actual: row?.status, srs: ['REQ-4.11-04'] });
  const audited = await auditRow('CREATE_FAQ_ENTRY', { affected_record_id: ids.faq });
  check('POST /faq/entries', 'db', 'change audited', Boolean(audited), { expected: 'audit', actual: audited?.action ?? null, srs: ['REQ-4.11-09'] });
  await call('missing answer refused', 'invalid', 'curator', 'POST', '/faq/entries', 400, { json: { question: 'Q?' } });
  await call('blank question refused', 'invalid', 'curator', 'POST', '/faq/entries', 400, { json: { question: '', answer: 'A' } });
  await call('list', 'happy', 'curator', 'GET', '/faq/entries', 200);
  await call('filter', 'happy', 'curator', 'GET', '/faq/entries', 200, { query: { category: 'Visiting', search: 'audit' } });
  await call('bad status filter refused', 'invalid', 'curator', 'GET', '/faq/entries', 400, { query: { status: 'NOPE' } });
  await call('read', 'happy', 'curator', 'GET', `/faq/entries/${ids.faq}`, 200, { op: '/faq/entries/:id' });
  await call('unknown is 404', 'invalid', 'curator', 'GET', `/faq/entries/${UNKNOWN_ID}`, 404, { op: '/faq/entries/:id' });

  section('4.11 FAQ assistant', ['REQ-4.11-04']);
  const before = await call('inactive knowledge not used', 'happy', 'none', 'POST', '/faq/assistant/ask', 200, { json: { question: 'What are the audit museum hours?' } });
  check('POST /faq/assistant/ask', 'shape', 'inactive entry gives no answer', !JSON.stringify(before.body).includes('nine to five'), { expected: 'fallback', actual: before.body });

  section('4.11 FAQ assistant', ['REQ-4.11-02']);
  await call('activate', 'happy', 'curator', 'PATCH', `/faq/entries/${ids.faq}/activate`, 200, { op: '/faq/entries/:id/activate' });
  await call('edit', 'happy', 'curator', 'PATCH', `/faq/entries/${ids.faq}`, [200, 409], { json: { answer: 'Audit answer: nine to five daily.' }, op: '/faq/entries/:id' });
  await call('edit refuses unknown field', 'invalid', 'curator', 'PATCH', `/faq/entries/${ids.faq}`, 400, { json: { status: 'ACTIVE' }, op: '/faq/entries/:id' });

  section('4.11 FAQ assistant', ['REQ-4.11-01', 'REQ-4.11-03', 'REQ-4.11-04']);
  const direct = await call('exact question answered', 'happy', 'none', 'POST', '/faq/assistant/ask', 200, { json: { question: 'What are the audit museum hours?' } });
  check('POST /faq/assistant/ask', 'shape', 'answer comes from the entry', /nine to five/.test(JSON.stringify(direct.body)), { expected: 'curator answer', actual: direct.body });
  const alt = await call('alternative wording answered', 'happy', 'none', 'POST', '/faq/assistant/ask', 200, { json: { question: 'When is the audit museum open?' } });
  check('POST /faq/assistant/ask', 'shape', 'alternative wording matches', /nine to five/.test(JSON.stringify(alt.body)), { expected: 'curator answer', actual: alt.body });
  const sug = await call('suggestions', 'happy', 'none', 'GET', '/faq/assistant/suggestions', 200);
  check('GET /faq/assistant/suggestions', 'shape', 'active entry suggested', JSON.stringify(sug.body).includes(ids.faq), { expected: 'entry', actual: sug.body });
  await call('suggestion limit validated', 'invalid', 'none', 'GET', '/faq/assistant/suggestions', 400, { query: { limit: 0 } });
  await call('selected suggestion answered', 'happy', 'none', 'POST', '/faq/assistant/ask', 200, { json: { question: 'x', selectedFaqId: ids.faq } });

  section('4.11 FAQ assistant', ['REQ-4.11-06', 'REQ-4.11-05']);
  const miss = await call('unmatched question', 'happy', 'none', 'POST', '/faq/assistant/ask', 200, { json: { question: 'Why is the sky purple on Mars?' } });
  check('POST /faq/assistant/ask', 'shape', 'states no approved answer and points to General Inquiry', /inquiry/i.test(JSON.stringify(miss.body)) && !miss.body?.answer, { expected: 'fallback', actual: miss.body });
  const species = await call('species identification not attempted', 'happy', 'none', 'POST', '/faq/assistant/ask', 200, { json: { question: 'Can you identify this species of snake with red bands?' } });
  check('POST /faq/assistant/ask', 'shape', 'no invented identification', !species.body?.answer, { expected: 'no answer', actual: species.body });
  const transact = await call('visit transaction not performed', 'happy', 'none', 'POST', '/faq/assistant/ask', 200, { json: { question: 'Please cancel my visit request for tomorrow' } });
  const visitCount = await one('select count(*)::int n from visit_request where status = $1', ['CANCELLED']);
  check('POST /faq/assistant/ask', 'shape', 'assistant performs no transaction', !transact.body?.answer || !/cancelled your/i.test(JSON.stringify(transact.body)), { expected: 'redirect', actual: transact.body });
  check('POST /faq/assistant/ask', 'db', 'no visit changed', visitCount.n === 1, { expected: '1 cancelled from suite 50', actual: visitCount.n });

  section('4.11 FAQ assistant', ['REQ-4.11-07']);
  await call('empty question refused', 'invalid', 'none', 'POST', '/faq/assistant/ask', 400, { json: { question: '' } });
  await call('long question refused', 'invalid', 'none', 'POST', '/faq/assistant/ask', 400, { json: { question: 'x'.repeat(501) } });
  await call('bad id refused', 'invalid', 'none', 'POST', '/faq/assistant/ask', 400, { json: { question: 'x', selectedFaqId: 'nope' } });
  const piiQuestion = 'My email is leak@example.invalid and my number is 09171234567, what are the hours?';
  await api('none', 'POST', '/faq/assistant/ask', { json: { question: piiQuestion } });
  const leaked = await one("select count(*)::int n from audit_log where details::text like '%leak@example.invalid%'");
  const leaked2 = await one("select count(*)::int n from faq_review_item where question like '%leak@example.invalid%'");
  check('POST /faq/assistant/ask', 'db', 'ask stores no personal data', leaked.n === 0 && leaked2.n === 0, { expected: 0, actual: [leaked.n, leaked2.n] });
  const storage = await api('none', 'POST', '/faq/assistant/ask', { json: { question: 'Where is specimen AUD-0001 stored in Audit Drawer?' } });
  check('POST /faq/assistant/ask', 'shape', 'no storage location disclosed', !/Audit Drawer B|Audit Cabinet/.test(JSON.stringify(storage.body).replace('Audit Drawer?', '')), { expected: 'no location', actual: storage.body, srs: ['REQ-4.6-10', 'REQ-4.11-07'] });

  section('4.11 FAQ assistant', ['REQ-4.11-02', 'REQ-4.11-04']);
  await call('deactivate', 'happy', 'curator', 'PATCH', `/faq/entries/${ids.faq}/deactivate`, 200, { op: '/faq/entries/:id/deactivate' });
  const off = await api('none', 'POST', '/faq/assistant/ask', { json: { question: 'What are the audit museum hours?' } });
  check('POST /faq/assistant/ask', 'shape', 'deactivated entry stops answering', !/nine to five/.test(JSON.stringify(off.body)), { expected: 'fallback', actual: off.body });
  await call('archive', 'happy', 'curator', 'PATCH', `/faq/entries/${ids.faq}/archive`, 200, { op: '/faq/entries/:id/archive' });
  const arch = await one('select status from faq_entry where id = $1', [ids.faq]);
  check('PATCH /faq/entries/:id/archive', 'db', 'archived', arch?.status === 'ARCHIVED', { expected: 'ARCHIVED', actual: arch?.status });
  await call('archived entry cannot be activated', 'invalid', 'curator', 'PATCH', `/faq/entries/${ids.faq}/activate`, [400, 409], { op: '/faq/entries/:id/activate' });
  const changes = await sql("select distinct action from audit_log where module='faq' and affected_record_id = $1", [ids.faq]);
  check('PATCH /faq/entries/:id', 'db', 'all knowledge changes audited', changes.length >= 3, { expected: '>=3 actions', actual: changes.map((c) => c.action), srs: ['REQ-4.11-09'] });

  // Opt-in review queue: not an SRS requirement, called for route coverage.
  section('4.11 FAQ assistant', []);
  const policy = await call('review policy', 'happy', 'none', 'GET', '/faq/assistant/review-policy', 200);
  check('GET /faq/assistant/review-policy', 'shape', 'reports enabled flag', 'enabled' in (policy.body ?? {}), { expected: 'enabled', actual: policy.body });
  await call('consent required', 'invalid', 'none', 'POST', '/faq/assistant/review-submissions', 400, { json: { question: 'Audit queue question', consent: false, submissionId: randomUUID() } });
  await call('bad submission id refused', 'invalid', 'none', 'POST', '/faq/assistant/review-submissions', 400, { json: { question: 'Audit queue question', consent: true, submissionId: 'x' } });
  await call('consented question queued', 'happy', 'none', 'POST', '/faq/assistant/review-submissions', 201, { json: { question: 'Audit queue question', consent: true, submissionId: randomUUID() } });
  const queue = await call('curator reads queue', 'happy', 'curator', 'GET', '/faq/review-queue', 200);
  const item = await one("select id from faq_review_item where question = 'Audit queue question'");
  check('GET /faq/review-queue', 'shape', 'queued question listed', JSON.stringify(queue.body).includes('Audit queue question'), { expected: 'item', actual: queue.body?.total ?? queue.body });
  await call('bad review status refused', 'invalid', 'curator', 'PATCH', `/faq/review-queue/${item?.id}`, 400, { json: { status: 'NOPE' }, op: '/faq/review-queue/:id' });
  await call('review item', 'happy', 'curator', 'PATCH', `/faq/review-queue/${item?.id}`, 200, { json: { status: 'REVIEWED' }, op: '/faq/review-queue/:id' });
  await call('remove item', 'happy', 'curator', 'DELETE', `/faq/review-queue/${item?.id}`, 200, { op: '/faq/review-queue/:id' });
  await call('unknown item is 404', 'invalid', 'curator', 'DELETE', `/faq/review-queue/${UNKNOWN_ID}`, 404, { op: '/faq/review-queue/:id' });
}
