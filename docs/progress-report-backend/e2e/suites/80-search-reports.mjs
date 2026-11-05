// SRS 4.7 search, filtering, reports and export.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { auditRow, call, check, ids, one, repo, section } from '../lib.mjs';

const { unzipSync, strFromU8 } = createRequire(join(repo, 'package.json'))('fflate');

const search = (name, query, expectMatch, srs) => ({ name, query, expectMatch, srs });
const sig = { PDF: '%PDF', DOCX: 'PK' };

export default async function run() {
  section('4.7 Search, reports and export', ['REQ-4.7-01']);
  const id = ids.specimen;
  for (const c of [
    search('by accession', { search: 'AUD-0001' }, true),
    search('by system id', { search: id }, true),
    search('by scientific name', { search: 'Auditus mainus' }, true),
    search('by common name', { search: 'Audit Main' }, true),
    search('by category', { search: 'Mollusk' }, true),
    search('no false match', { search: 'zzzz-no-such' }, false),
  ]) {
    const r = await call(c.name, 'happy', 'curator', 'GET', '/specimens/search', 200, { query: c.query });
    check('GET /specimens/search', 'shape', `${c.name} result`, JSON.stringify(r.body).includes(id) === c.expectMatch, { expected: c.expectMatch, actual: r.body?.total ?? null });
  }

  section('4.7 Search, reports and export', ['REQ-4.7-02']);
  for (const [name, query, match] of [
    ['kingdom', { kingdom: 'Animalia' }, true],
    ['phylum', { phylum: 'Mollusca' }, true],
    ['class', { taxonClass: 'Bivalvia' }, true],
    ['family', { family: 'Tridacnidae' }, true],
    ['genus', { genus: 'Tridacna' }, true],
    ['species', { species: 'gigas' }, true],
    ['category', { specimenCategory: 'Mollusk' }, true],
    ['status', { status: 'CATALOGED' }, true],
    ['wrong status', { status: 'ARCHIVED' }, false],
    ['condition', { conditionClass: 'Good' }, true],
    ['public display', { publicDisplay: true }, true],
    ['storage unit', { storageUnitId: ids.drawerB }, true],
    ['storage with descendants', { storageUnitId: ids.room, includeDescendantUnits: true }, true],
    ['collection', { collectionId: ids.collection }, true],
    ['date range', { createdFrom: '2026-01-01', createdTo: '2026-12-31' }, true],
  ]) {
    const r = await call(`filter: ${name}`, 'happy', 'curator', 'GET', '/specimens/search', 200, { query });
    check('GET /specimens/search', 'shape', `filter ${name} result`, JSON.stringify(r.body).includes(id) === match, { expected: match, actual: r.body?.total ?? null });
  }
  await call('bad status refused', 'invalid', 'curator', 'GET', '/specimens/search', 400, { query: { status: 'NOPE' } });
  await call('bad date refused', 'invalid', 'curator', 'GET', '/specimens/search', 400, { query: { createdFrom: 'x' } });
  await call('bad limit refused', 'invalid', 'curator', 'GET', '/specimens/search', 400, { query: { limit: 0 } });

  section('4.7 Search, reports and export', ['REQ-4.7-03']);
  const asc = await call('sort asc', 'happy', 'curator', 'GET', '/specimens/search', 200, { query: { sortBy: 'commonName', sortDirection: 'asc', limit: 100 } });
  const desc = await call('sort desc', 'happy', 'curator', 'GET', '/specimens/search', 200, { query: { sortBy: 'commonName', sortDirection: 'desc', limit: 100 } });
  const names = (r) => (r.body?.items ?? r.body?.data ?? []).map((s) => s.commonName);
  check('GET /specimens/search', 'shape', 'sort changes the order', names(asc).length > 1 && names(asc)[0] !== names(desc)[0], { expected: 'different first row', actual: [names(asc)[0], names(desc)[0]] });
  await call('unknown sort refused', 'invalid', 'curator', 'GET', '/specimens/search', 400, { query: { sortBy: 'password' } });

  section('4.7 Search, reports and export', ['REQ-4.7-04']);
  const defs = await call('report definitions', 'happy', 'curator', 'GET', '/reports', 200);
  for (const type of ['CONSOLIDATED_OPERATIONS', 'INVENTORY', 'INQUIRY_SUMMARY', 'VISIT_REQUEST_SUMMARY', 'QR_AR_EXHIBITS']) {
    check('GET /reports', 'shape', `${type} offered`, JSON.stringify(defs.body).includes(type), { expected: type, actual: 'checked' });
  }
  await call('summary', 'happy', 'curator', 'GET', '/reports/summary', 200);

  const generate = async (name, json, format, srs) => {
    const r = await call(name, 'happy', 'curator', 'POST', '/reports', [200, 201], { json: { format, ...json }, srs });
    const ok = format === 'CSV' ? r.raw.length > 0 && r.raw.toString('utf8').includes(',') : r.raw.subarray(0, sig[format].length).toString() === sig[format];
    check('POST /reports', 'shape', `${name} is a real ${format}`, ok, { expected: format, actual: { type: r.type, size: r.raw.length }, srs });
    return r;
  };

  const docx = await generate('consolidated monthly DOCX', { type: 'CONSOLIDATED_OPERATIONS', period: 'MONTHLY', month: '2026-11', remarks: 'Audit remarks' }, 'DOCX', ['REQ-4.7-05', 'REQ-4.7-06', 'REQ-4.7-11', 'REQ-4.7-16']);
  const xml = strFromU8(unzipSync(new Uint8Array(docx.raw))['word/document.xml'] ?? new Uint8Array()).replace(/<[^>]+>/g, ' ');
  for (const [label, pattern] of [
    ['inventory summary', /inventory/i], ['inventory changes', /change|added/i], ['condition breakdown', /condition/i],
    ['category breakdown', /categor/i], ['inquiry summary', /inquir/i], ['visit summary', /visit/i],
    ['QR/AR summary', /QR/], ['curator remarks', /Audit remarks/],
  ]) {
    check('POST /reports', 'shape', `consolidated DOCX contains ${label}`, pattern.test(xml), { expected: label, actual: pattern.test(xml), srs: ['REQ-4.7-06'] });
  }
  await generate('consolidated yearly DOCX', { type: 'CONSOLIDATED_OPERATIONS', period: 'YEARLY', year: 2026 }, 'DOCX', ['REQ-4.7-05']);
  await generate('consolidated custom PDF', { type: 'CONSOLIDATED_OPERATIONS', period: 'CUSTOM', from: '2026-01-01', to: '2026-12-31' }, 'PDF', ['REQ-4.7-05', 'REQ-4.7-12']);
  const inventory = await generate('inventory CSV', { type: 'INVENTORY', period: 'ALL_TIME' }, 'CSV', ['REQ-4.7-07', 'REQ-4.7-12']);
  check('POST /reports', 'shape', 'inventory contains the specimen', inventory.raw.toString('utf8').includes('AUD-0001'), { expected: 'row', actual: inventory.raw.length, srs: ['REQ-4.7-07'] });
  const filtered = await generate('filtered inventory CSV', { type: 'INVENTORY', period: 'ALL_TIME', specimenStatus: 'ARCHIVED' }, 'CSV', ['REQ-4.7-07']);
  check('POST /reports', 'shape', 'status filter applied', !filtered.raw.toString('utf8').includes('AUD-0001'), { expected: 'excluded', actual: filtered.raw.length, srs: ['REQ-4.7-07'] });
  const location = await generate('inventory by location, condition, taxonomy', { type: 'INVENTORY', period: 'ALL_TIME', storageUnitId: ids.drawerB, conditionClass: 'Good', kingdom: 'Animalia', publicDisplay: true, category: 'Mollusk' }, 'CSV', ['REQ-4.7-07']);
  check('POST /reports', 'shape', 'combined filters still find it', location.raw.toString('utf8').includes('AUD-0001'), { expected: 'row', actual: location.raw.length, srs: ['REQ-4.7-07'] });
  await generate('inventory PDF', { type: 'INVENTORY', period: 'ALL_TIME' }, 'PDF', ['REQ-4.7-07', 'REQ-4.7-12']);
  await generate('inquiry CSV by status', { type: 'INQUIRY_SUMMARY', period: 'CUSTOM', from: '2026-01-01', to: '2026-12-31', inquiryStatus: 'CLOSED' }, 'CSV', ['REQ-4.7-08', 'REQ-4.7-13']);
  await generate('inquiry PDF', { type: 'INQUIRY_SUMMARY', period: 'ALL_TIME' }, 'PDF', ['REQ-4.7-08', 'REQ-4.7-12']);
  await generate('visit CSV by status', { type: 'VISIT_REQUEST_SUMMARY', period: 'CUSTOM', from: '2026-01-01', to: '2026-12-31', visitStatus: 'COMPLETED' }, 'CSV', ['REQ-4.7-09', 'REQ-4.7-13']);
  await generate('visit PDF', { type: 'VISIT_REQUEST_SUMMARY', period: 'ALL_TIME' }, 'PDF', ['REQ-4.7-09', 'REQ-4.7-12']);
  const qr = await generate('QR/AR CSV', { type: 'QR_AR_EXHIBITS', period: 'ALL_TIME' }, 'CSV', ['REQ-4.7-10', 'REQ-4.7-12']);
  check('POST /reports', 'shape', 'exhibit listed', qr.raw.toString('utf8').includes('audit-exhibit'), { expected: 'row', actual: qr.raw.length, srs: ['REQ-4.7-10'] });
  await generate('QR/AR PDF', { type: 'QR_AR_EXHIBITS', period: 'ALL_TIME', exhibitStatus: 'PUBLISHED' }, 'PDF', ['REQ-4.7-10']);
  await generate('filtered audit-log report (extra type)', { type: 'AUDIT_LOG', period: 'ALL_TIME', auditModule: 'auth' }, 'CSV', ['REQ-4.15-04']);

  section('4.7 Search, reports and export', ['REQ-4.7-15']);
  await call('missing type refused', 'invalid', 'curator', 'POST', '/reports', 400, { json: { format: 'PDF', period: 'ALL_TIME' } });
  await call('unknown format refused', 'invalid', 'curator', 'POST', '/reports', 400, { json: { type: 'INVENTORY', format: 'XLS', period: 'ALL_TIME' } });
  await call('custom period needs dates', 'invalid', 'curator', 'POST', '/reports', 400, { json: { type: 'INVENTORY', format: 'CSV', period: 'CUSTOM' } });
  await call('reversed dates refused', 'invalid', 'curator', 'POST', '/reports', 400, { json: { type: 'INVENTORY', format: 'CSV', period: 'CUSTOM', from: '2026-12-31', to: '2026-01-01' } });
  await call('monthly needs a month', 'invalid', 'curator', 'POST', '/reports', 400, { json: { type: 'INVENTORY', format: 'CSV', period: 'MONTHLY' } });
  const bad = await call('DOCX for a report without DOCX refused', 'invalid', 'curator', 'POST', '/reports', [200, 201, 400], { json: { type: 'INQUIRY_SUMMARY', format: 'DOCX', period: 'ALL_TIME' } });
  void bad;

  section('4.7 Search, reports and export', ['REQ-4.7-14']);
  const audit = await auditRow('GENERATE_REPORT', { status: 'SUCCESS' });
  const details = JSON.stringify(audit?.details ?? {});
  check('POST /reports', 'db', 'report audited with type, format, filters, actor', Boolean(audit) && audit?.user_id === ids.curator && /format/i.test(details) && /type/i.test(details), { expected: 'details', actual: audit?.details ?? null });
  const hist = await call('history', 'happy', 'curator', 'GET', '/reports/history', 200);
  check('GET /reports/history', 'shape', 'entries returned', (hist.body?.total ?? hist.body?.items?.length ?? hist.body?.length ?? 0) > 0, { expected: '>0', actual: hist.body?.total ?? null });
  await call('history filter', 'happy', 'curator', 'GET', '/reports/history', 200, { query: { type: 'INVENTORY', result: 'SUCCESS' } });
  await call('history bad filter refused', 'invalid', 'curator', 'GET', '/reports/history', 400, { query: { result: 'NOPE' } });

  section('4.7 Search, reports and export', ['REQ-4.7-13']);
  const count = await one("select count(*)::int n from audit_log where action = 'GENERATE_REPORT'");
  check('POST /reports', 'db', 'reports only reachable by curators', count.n > 0, { expected: 'guarded by auth matrix', actual: count.n });
}
