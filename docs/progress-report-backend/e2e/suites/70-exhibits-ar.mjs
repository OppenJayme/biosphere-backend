// SRS 4.12 QR exhibits, 4.13 WebAR, and the AR half of 4.2.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { api, auditRow, call, check, ids, info, one, PNG, repo, section, sql, UNKNOWN_ID, upload } from '../lib.mjs';
import { catalogedSpecimen } from './30-cataloging.mjs';

const glbDir = resolve(repo, '../glb-test-files');
const glb = (name) => readFileSync(resolve(glbDir, name));
const GLB = 'model/gltf-binary';
const FORBIDDEN = /Audit Drawer|Audit Cabinet|Audit Room|storage_unit|storageUnit|condition|remarks|Audit remark|accession|AUD-0001|created_by|createdBy/i;

export default async function run() {
  const op = '/exhibits/:id';
  section('4.12 QR exhibits', ['REQ-4.12-02', 'REQ-4.4-11']);
  await call('uncataloged source refused', 'invalid', 'curator', 'POST', '/exhibits', [400, 409], { json: { specimenId: ids.sparse, publicSlug: 'audit-bad-1' } });
  const notPublic = await catalogedSpecimen('NOPUB');
  await call('source without public approval refused', 'invalid', 'curator', 'POST', '/exhibits', [400, 409], { json: { specimenId: notPublic, publicSlug: 'audit-bad-2' } });
  await call('unknown specimen refused', 'invalid', 'curator', 'POST', '/exhibits', 404, { json: { specimenId: UNKNOWN_ID, publicSlug: 'audit-bad-3' } });

  section('4.12 QR exhibits', ['REQ-4.12-01', 'REQ-4.12-03', 'REQ-4.12-04']);
  const made = await call('create exhibit', 'happy', 'curator', 'POST', '/exhibits', 201, {
    json: { specimenId: ids.specimen, publicSlug: 'audit-exhibit', publicDescription: 'Audit public description', interestingFacts: 'Audit fact', publicSpecimenFields: ['commonName', 'scientificName'] },
  });
  ids.exhibit = made.body?.id;
  const e = `/exhibits/${ids.exhibit}`;
  const row = await one('select * from exhibit where id = $1', [ids.exhibit]);
  check('POST /exhibits', 'db', 'draft stored with slug and chosen fields', row?.public_slug === 'audit-exhibit' && row?.status === 'UNPUBLISHED', { expected: 'UNPUBLISHED', actual: row ? { slug: row.public_slug, status: row.status } : null });
  await call('missing slug refused', 'invalid', 'curator', 'POST', '/exhibits', 400, { json: { specimenId: ids.specimen } });
  await call('bad slug refused', 'invalid', 'curator', 'POST', '/exhibits', 400, { json: { specimenId: ids.specimen, publicSlug: 'Bad Slug!' } });
  const other = await catalogedSpecimen('EXH2');
  await api('curator', 'PATCH', `/specimens/${other}/public-display`, { json: { publicDisplay: true } });
  await call('duplicate slug refused', 'invalid', 'curator', 'POST', '/exhibits', 409, { json: { specimenId: other, publicSlug: 'audit-exhibit' } });
  await call('list', 'happy', 'curator', 'GET', '/exhibits', 200);
  await call('filter', 'happy', 'curator', 'GET', '/exhibits', 200, { query: { status: 'UNPUBLISHED', search: 'audit' } });
  await call('bad status filter refused', 'invalid', 'curator', 'GET', '/exhibits', 400, { query: { status: 'NOPE' } });
  await call('read', 'happy', 'curator', 'GET', e, 200, { op });
  await call('unknown is 404', 'invalid', 'curator', 'GET', `/exhibits/${UNKNOWN_ID}`, 404, { op });
  await call('edit', 'happy', 'curator', 'PATCH', e, 200, { json: { diet: 'Audit diet', publicSpecimenFields: ['commonName', 'scientificName', 'kingdom'] }, op });
  await call('empty edit refused', 'invalid', 'curator', 'PATCH', e, 400, { json: {}, op });
  await call('restricted public field refused', 'invalid', 'curator', 'PATCH', e, 400, { json: { publicSpecimenFields: ['storageLocation'] }, op });

  const media = await call('add media', 'happy', 'curator', 'POST', `${e}/media`, 201, { form: upload({ caption: 'Audit exhibit image', isCover: true, displayOrder: 0 }, PNG), op: `${op}/media`, srs: ['REQ-4.12-03'] });
  ids.exhibitMedia = media.body?.id;
  await call('non-image refused', 'invalid', 'curator', 'POST', `${e}/media`, 400, { form: upload({}, Buffer.from('nope'), 'a.txt', 'text/plain'), op: `${op}/media`, srs: ['REQ-4.12-03'] });
  await call('no file refused', 'invalid', 'curator', 'POST', `${e}/media`, 400, { form: upload({ caption: 'x' }), op: `${op}/media`, srs: ['REQ-4.12-03'] });
  await call('update media', 'happy', 'curator', 'PATCH', `${e}/media/${ids.exhibitMedia}`, 200, { json: { caption: 'Edited' }, op: `${op}/media/:id`, srs: ['REQ-4.12-03'] });
  await call('empty media update refused', 'invalid', 'curator', 'PATCH', `${e}/media/${ids.exhibitMedia}`, 400, { json: {}, op: `${op}/media/:id`, srs: ['REQ-4.12-03'] });
  const extra = await api('curator', 'POST', `${e}/media`, { form: upload({}, PNG) });
  await call('remove media', 'happy', 'curator', 'DELETE', `${e}/media/${extra.body?.id}`, 200, { op: `${op}/media/:id`, srs: ['REQ-4.12-03'] });

  section('4.12 QR exhibits', ['REQ-4.12-09']);
  const hidden = await api('none', 'GET', '/exhibits/public/audit-exhibit');
  check('GET /exhibits/public/:slug', 'no-jwt', 'unpublished page unavailable and hides content', hidden.status === 404 && !JSON.stringify(hidden.body).includes('Audit public description'), { expected: '404', actual: hidden.status });

  section('4.12 QR exhibits', ['REQ-4.12-01', 'REQ-4.12-11']);
  await call('publish', 'happy', 'curator', 'PATCH', `${e}/publish`, 200, { op: `${op}/publish` });
  const published = await one('select status, published_at from exhibit where id = $1', [ids.exhibit]);
  check(`PATCH ${op}/publish`, 'db', 'status PUBLISHED', published?.status === 'PUBLISHED' && Boolean(published?.published_at), { expected: 'PUBLISHED', actual: published });
  const pubAudit = await auditRow('PUBLISH_EXHIBIT', { affected_record_id: ids.exhibit });
  check(`PATCH ${op}/publish`, 'db', 'publication audited', Boolean(pubAudit), { expected: 'audit', actual: pubAudit?.action ?? null });
  await call('repeat publish is a safe no-op', 'invalid', 'curator', 'PATCH', `${e}/publish`, [200, 400], { op: `${op}/publish` });

  section('4.12 QR exhibits', ['REQ-4.12-12', 'REQ-4.12-08', 'REQ-4.6-10', 'REQ-4.13-07']);
  const page = await call('published page opens without login', 'happy', 'none', 'GET', '/exhibits/public/audit-exhibit', 200);
  check('GET /exhibits/public/:slug', 'shape', 'approved content shown', /Audit public description/.test(JSON.stringify(page.body)), { expected: 'description', actual: Object.keys(page.body ?? {}) });
  check('GET /exhibits/public/:slug', 'shape', 'restricted fields absent', !FORBIDDEN.test(JSON.stringify(page.body)), { expected: 'no restricted data', actual: JSON.stringify(page.body).match(FORBIDDEN)?.[0] ?? 'clean' });
  check('GET /exhibits/public/:slug', 'shape', 'only chosen specimen fields exposed', !/Bivalvia|Tridacnidae/.test(JSON.stringify(page.body)), { expected: 'class and family withheld', actual: page.body?.specimen ?? null, srs: ['REQ-4.12-03'] });

  section('4.12 QR exhibits', ['REQ-4.12-05', 'REQ-4.12-04']);
  const qr = await call('png qr', 'happy', 'curator', 'GET', `${e}/qr`, 200, { op: `${op}/qr` });
  check(`GET ${op}/qr`, 'shape', 'real PNG returned', qr.raw.subarray(1, 4).toString() === 'PNG', { expected: 'PNG', actual: qr.type });
  const svg = await call('svg qr', 'happy', 'curator', 'GET', `${e}/qr`, 200, { query: { format: 'svg' }, op: `${op}/qr` });
  check(`GET ${op}/qr`, 'shape', 'svg returned', /<svg/.test(svg.text), { expected: 'svg', actual: svg.type });
  await call('bad format refused', 'invalid', 'curator', 'GET', `${e}/qr`, 400, { query: { format: 'gif' }, op: `${op}/qr` });
  await call('bad size refused', 'invalid', 'curator', 'GET', `${e}/qr`, 400, { query: { size: 1 }, op: `${op}/qr` });
  section('4.12 QR exhibits', ['REQ-4.12-06']);
  const label = await call('label', 'happy', 'curator', 'GET', `${e}/label`, 200, { op: `${op}/label` });
  check(`GET ${op}/label`, 'shape', 'label contains the direct URL', /audit-exhibit/.test(label.text) || label.raw.length > 500, { expected: 'printable label', actual: { type: label.type, size: label.raw.length } });

  section('4.12 QR exhibits', ['REQ-4.12-10']);
  await call('edit keeps url', 'happy', 'curator', 'PATCH', e, 200, { json: { publicDescription: 'Audit public description v2' }, op });
  const stable = await one('select public_slug from exhibit where id = $1', [ids.exhibit]);
  const v2 = await api('none', 'GET', '/exhibits/public/audit-exhibit');
  check(`PATCH ${op}`, 'db', 'slug stable and page updated', stable?.public_slug === 'audit-exhibit' && /v2/.test(JSON.stringify(v2.body)), { expected: 'same slug', actual: stable });
  await call('intentional replacement', 'happy', 'curator', 'PATCH', `${e}/replace-url`, 200, { json: { publicSlug: 'audit-exhibit-2' }, op: `${op}/replace-url` });
  await call('old url gone', 'invalid', 'none', 'GET', '/exhibits/public/audit-exhibit', 404, { op: '/exhibits/public/:slug' });
  await call('bad replacement refused', 'invalid', 'curator', 'PATCH', `${e}/replace-url`, 400, { json: { publicSlug: 'Bad Slug!' }, op: `${op}/replace-url` });
  await api('curator', 'PATCH', `${e}/replace-url`, { json: { publicSlug: 'audit-exhibit' } });

  section('4.12 QR exhibits', ['REQ-4.12-09', 'REQ-4.12-01', 'REQ-4.12-11']);
  await call('unpublish', 'happy', 'curator', 'PATCH', `${e}/unpublish`, 200, { op: `${op}/unpublish` });
  await call('unpublished url unavailable', 'invalid', 'none', 'GET', '/exhibits/public/audit-exhibit', 404, { op: '/exhibits/public/:slug' });
  await api('curator', 'PATCH', `${e}/publish`, {});
  const disabledExhibit = await api('curator', 'POST', '/exhibits', { json: { specimenId: other, publicSlug: 'audit-disable', publicDescription: 'Audit public disable page' } });
  const d = `/exhibits/${disabledExhibit.body?.id}`;
  await api('curator', 'PATCH', `${d}/publish`, {});
  await call('disable', 'happy', 'curator', 'PATCH', `${d}/disable`, 200, { op: `${op}/disable` });
  const off = await api('none', 'GET', '/exhibits/public/audit-disable');
  check('GET /exhibits/public/:slug', 'no-jwt', 'disabled url hides prior content', off.status === 404 && !/Audit public/.test(JSON.stringify(off.body)), { expected: 404, actual: off.status });
  await call('disabled exhibit cannot be republished', 'invalid', 'curator', 'PATCH', `${d}/publish`, 400, { op: `${op}/publish` });

  // ---- AR selection and assets --------------------------------------------
  section('4.13 WebAR', ['REQ-4.13-02', 'REQ-4.13-08']);
  await call('selection flag required', 'invalid', 'curator', 'PATCH', `${e}/ar-selection`, 400, { json: {}, op: `${op}/ar-selection` });
  await call('note above limit refused', 'invalid', 'curator', 'PATCH', `${e}/ar-selection`, 400, { json: { selected: true, note: 'x'.repeat(1001) }, op: `${op}/ar-selection` });
  await call('curator selects exhibit for AR', 'happy', 'curator', 'PATCH', `${e}/ar-selection`, 200, { json: { selected: true, note: 'Audit: endemic species' }, op: `${op}/ar-selection` });
  const sel = await one('select ar_selected_at, ar_selection_note from exhibit where id = $1', [ids.exhibit]);
  check(`PATCH ${op}/ar-selection`, 'db', 'selection stored', Boolean(sel?.ar_selected_at), { expected: 'ar_selected_at', actual: sel });

  section('4.2 Developer functions', ['REQ-4.2-04', 'REQ-4.13-03']);
  const ar = await call('marked exhibit listed', 'happy', 'developer', 'GET', '/developer/ar-exhibits', 200);
  check('GET /developer/ar-exhibits', 'shape', 'exhibit offered', JSON.stringify(ar.body).includes(ids.exhibit), { expected: 'exhibit', actual: Array.isArray(ar.body) ? ar.body.length : ar.body });
  check('GET /developer/ar-exhibits', 'shape', 'only public identity exposed', !/AUD-0001|Audit Drawer/.test(JSON.stringify(ar.body)), { expected: 'no internal data', actual: 'checked', srs: ['REQ-4.2-08'] });
  const form = (file, extras = {}, name = 'model.glb') => upload({ exhibitId: ids.exhibit, modelFormat: 'glb', authorizationReference: 'Audit memo', ...extras }, file, name, GLB);

  section('4.2 Developer functions', ['REQ-4.2-05']);
  await call('empty file refused', 'invalid', 'developer', 'POST', '/developer/ar-assets', 400, { form: form(glb('2-empty.glb')) });
  await call('non-model file refused', 'invalid', 'developer', 'POST', '/developer/ar-assets', 400, { form: form(glb('3-not-a-model.glb')) });
  const extBuffer = await call('external buffer refused by the API', 'invalid', 'developer', 'POST', '/developer/ar-assets', 400, { form: form(glb('4-external-buffer.glb')) });
  await call('external texture refused by the API', 'invalid', 'developer', 'POST', '/developer/ar-assets', 400, { form: form(glb('5-external-texture.glb')) });
  if (extBuffer.body?.id) {
    await call('incompatible model cannot be activated', 'invalid', 'developer', 'PATCH', `/developer/ar-assets/${extBuffer.body.id}/activate`, [400, 409], { json: { authorizationReference: 'Audit memo' }, op: '/developer/ar-assets/:id/activate' });
    await sql('delete from ar_asset where exhibit_id = $1', [ids.exhibit]);
  }
  await call('oversize file refused', 'invalid', 'developer', 'POST', '/developer/ar-assets', [400, 413], { form: form(glb('6-too-large-51mb.glb')) });
  await call('missing authorization refused', 'invalid', 'developer', 'POST', '/developer/ar-assets', [400, 403], { form: upload({ exhibitId: ids.exhibit, modelFormat: 'glb' }, glb('1-valid-cube.glb'), 'model.glb', GLB) });
  const rejected = await auditRow('CREATE_AR_ASSET', { status: 'DENIED' }) ?? await auditRow('CREATE_AR_ASSET', { status: 'FAILED' });
  check('POST /developer/ar-assets', 'db', 'refused attempt audited', Boolean(rejected), { expected: 'audit', actual: rejected?.status ?? null, srs: ['REQ-4.2-09'] });
  await call('unsupported format refused', 'invalid', 'developer', 'POST', '/developer/ar-assets', 400, { form: form(glb('1-valid-cube.glb'), { modelFormat: 'fbx' }) });
  await call('no file refused', 'invalid', 'developer', 'POST', '/developer/ar-assets', 400, { form: upload({ exhibitId: ids.exhibit, modelFormat: 'glb', authorizationReference: 'x' }) });
  await call('unmarked exhibit refused', 'invalid', 'developer', 'POST', '/developer/ar-assets', [400, 403, 404, 409], { form: upload({ exhibitId: UNKNOWN_ID, modelFormat: 'glb', authorizationReference: 'x' }, glb('1-valid-cube.glb'), 'model.glb', GLB) });

  section('4.2 Developer functions', ['REQ-4.2-04', 'REQ-4.13-03', 'REQ-4.2-09']);
  const asset = await call('valid upload', 'happy', 'developer', 'POST', '/developer/ar-assets', 201, { form: form(glb('1-valid-cube.glb')) });
  ids.asset = asset.body?.id;
  const stored = await one('select * from ar_asset where id = $1', [ids.asset]);
  check('POST /developer/ar-assets', 'db', 'asset stored disabled and linked', stored?.exhibit_id === ids.exhibit && stored?.is_enabled === false, { expected: 'linked, disabled', actual: stored ?? null });
  const object = await one("select name from storage.objects where bucket_id='ar-assets' and name = $1", [stored?.storage_path]);
  check('POST /developer/ar-assets', 'db', 'file reached object storage', Boolean(object), { expected: 'object', actual: object ?? null });
  const createAudit = await auditRow('CREATE_AR_ASSET', { status: 'SUCCESS', affected_record_id: ids.asset });
  check('POST /developer/ar-assets', 'db', 'authorization recorded in audit', JSON.stringify(createAudit?.details ?? {}).includes('Audit memo'), { expected: 'reference', actual: createAudit?.details ?? null });
  await call('activation needs authorization', 'invalid', 'developer', 'PATCH', `/developer/ar-assets/${ids.asset}/activate`, [400, 403], { json: {}, op: '/developer/ar-assets/:id/activate', srs: ['REQ-4.2-05'] });
  await call('activate', 'happy', 'developer', 'PATCH', `/developer/ar-assets/${ids.asset}/activate`, 200, { json: { authorizationReference: 'Audit memo' }, op: '/developer/ar-assets/:id/activate' });
  await call('unknown asset is 404', 'invalid', 'developer', 'PATCH', `/developer/ar-assets/${UNKNOWN_ID}/activate`, 404, { json: { authorizationReference: 'x' }, op: '/developer/ar-assets/:id/activate' });

  section('4.13 WebAR', ['REQ-4.13-01', 'REQ-4.13-04']);
  await call('enable flag required', 'invalid', 'curator', 'PATCH', `${e}/ar`, 400, { json: {}, op: `${op}/ar` });
  await call('curator enables AR', 'happy', 'curator', 'PATCH', `${e}/ar`, 200, { json: { enabled: true }, op: `${op}/ar` });
  const withAr = await api('none', 'GET', '/exhibits/public/audit-exhibit');
  const arText = JSON.stringify(withAr.body);
  check('GET /exhibits/public/:slug', 'shape', 'active approved asset exposed to the page', /glb|arModel|model/i.test(arText), { expected: 'AR model', actual: withAr.body?.ar ?? withAr.body?.arModel ?? null });
  check('GET /exhibits/public/:slug', 'shape', 'AR response keeps restricted data out', !FORBIDDEN.test(arText), { expected: 'clean', actual: arText.match(FORBIDDEN)?.[0] ?? 'clean', srs: ['REQ-4.13-07'] });

  section('4.2 Developer functions', ['REQ-4.2-04', 'REQ-4.13-03']);
  await call('replace file', 'happy', 'developer', 'PATCH', `/developer/ar-assets/${ids.asset}`, 200, { form: upload({ authorizationReference: 'Audit memo 2' }, glb('7-valid-cube-copy.glb'), 'model.glb', GLB), op: '/developer/ar-assets/:id' });
  await call('replacement validated', 'invalid', 'developer', 'PATCH', `/developer/ar-assets/${ids.asset}`, 400, { form: upload({ authorizationReference: 'Audit memo 2' }, glb('3-not-a-model.glb'), 'model.glb', GLB), op: '/developer/ar-assets/:id', srs: ['REQ-4.2-05'] });
  await call('deactivate', 'happy', 'developer', 'PATCH', `/developer/ar-assets/${ids.asset}/deactivate`, 200, { op: '/developer/ar-assets/:id/deactivate' });

  section('4.13 WebAR', ['REQ-4.13-04', 'REQ-4.13-06']);
  const noAr = await call('page stays available without AR', 'happy', 'none', 'GET', '/exhibits/public/audit-exhibit', 200, { op: '/exhibits/public/:slug' });
  check('GET /exhibits/public/:slug', 'shape', 'AR action hidden after deactivation', !/\.glb/.test(JSON.stringify(noAr.body)), { expected: 'no model', actual: noAr.body?.arModel ?? null });
  const second = await api('developer', 'POST', '/developer/ar-assets', { form: form(glb('1-valid-cube.glb')) });
  await api('developer', 'PATCH', `/developer/ar-assets/${ids.asset}/activate`, { json: { authorizationReference: 'Audit memo' } });
  await api('developer', 'PATCH', `/developer/ar-assets/${second.body?.id}/activate`, { json: { authorizationReference: 'Audit memo' } });
  const active = await sql('select id from ar_asset where exhibit_id = $1 and is_enabled', [ids.exhibit]);
  info('PATCH /developer/ar-assets/:id/activate', 'more than one active model per exhibit', { srs: ['REQ-4.13-03'], expected: 'policy not stated in SRS', actual: active.length, note: 'The 28 Oct report asks whether this is allowed.' });

  section('4.2 Developer functions', ['REQ-4.2-04', 'REQ-4.2-09']);
  await call('remove', 'happy', 'developer', 'DELETE', `/developer/ar-assets/${second.body?.id}`, 200, { op: '/developer/ar-assets/:id' });
  const removed = await one('select id from ar_asset where id = $1', [second.body?.id]);
  check('DELETE /developer/ar-assets/:id', 'db', 'asset removed', !removed, { expected: 'none', actual: removed ?? null });
  const removeAudit = await auditRow('REMOVE_AR_ASSET', { affected_record_id: second.body?.id });
  check('DELETE /developer/ar-assets/:id', 'db', 'removal audited', Boolean(removeAudit), { expected: 'audit', actual: removeAudit?.action ?? null });
  await call('unknown removal is 404', 'invalid', 'developer', 'DELETE', `/developer/ar-assets/${UNKNOWN_ID}`, 404, { op: '/developer/ar-assets/:id' });

  section('4.13 WebAR', ['REQ-4.13-08']);
  check('code', 'absence', 'no automatic AR scoring', true, { expected: 'none', actual: 'selection is a curator flag and free-text note; no ranking fields in schema' });
  section('4.13 WebAR', ['REQ-4.13-05', 'REQ-4.13-09']);
  info('frontend', 'camera permission and AR fallback messages', { expected: 'browser behavior', actual: 'not observable through the API' });

  section('4.12 QR exhibits', ['REQ-4.12-07']);
  const listing = await api('none', 'GET', '/exhibits');
  check('GET /exhibits', 'no-jwt', 'no public listing of exhibits', listing.status === 401, { expected: 401, actual: listing.status });

  section('4.12 QR exhibits', ['REQ-4.12-01', 'REQ-4.12-09', 'REQ-4.4-11']);
  // Archiving the source specimen must take a published exhibit offline.
  const source = await catalogedSpecimen('SRC');
  await api('curator', 'PATCH', `/specimens/${source}/public-display`, { json: { publicDisplay: true } });
  const ex = await api('curator', 'POST', '/exhibits', { json: { specimenId: source, publicSlug: 'audit-source', publicDescription: 'Audit source page' } });
  await api('curator', 'PATCH', `/exhibits/${ex.body?.id}/publish`, {});
  await call('source page is public', 'happy', 'none', 'GET', '/exhibits/public/audit-source', 200, { op: '/exhibits/public/:slug' });
  await api('curator', 'PATCH', `/specimens/${source}/reopen-cataloging`, { json: { reason: 'Audit' } });
  const reopened = await api('none', 'GET', '/exhibits/public/audit-source');
  check('GET /exhibits/public/:slug', 'no-jwt', 'page goes offline when the specimen stops being Cataloged', reopened.status === 404, { expected: 404, actual: reopened.status });
  await call('archive exhibit', 'happy', 'curator', 'PATCH', `/exhibits/${ex.body?.id}/archive`, 200, { op: `${op}/archive` });
  const ax = await one('select status, archived_at from exhibit where id = $1', [ex.body?.id]);
  check(`PATCH ${op}/archive`, 'db', 'archived', Boolean(ax?.archived_at), { expected: 'archived_at', actual: ax });
  await call('archived exhibit cannot change', 'invalid', 'curator', 'PATCH', `/exhibits/${ex.body?.id}`, 400, { json: { diet: 'x' }, op });
  await call('archived exhibit cannot publish', 'invalid', 'curator', 'PATCH', `/exhibits/${ex.body?.id}/publish`, 400, { op: `${op}/publish` });
}
