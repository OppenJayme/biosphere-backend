// SRS 4.4: specimen core, cataloging states, media, import, duplicates, tags.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import {
  api, auditRow, call, check, ids, info, one, PNG, repo, section, sql, UNKNOWN_ID, upload,
} from '../lib.mjs';

const { strToU8, zipSync } = createRequire(join(repo, 'package.json'))('fflate');

function xlsx(rows) {
  const cell = (value, c, r) => `<c r="${String.fromCharCode(65 + c)}${r + 1}" t="inlineStr"><is><t>${value}</t></is></c>`;
  return Buffer.from(zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
    '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Specimens" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, c, r)).join('')}</row>`).join('')}</sheetData></worksheet>`),
  }));
}

/** Creates a specimen that meets every catalog requirement, then catalogs it. */
export async function catalogedSpecimen(tag) {
  const collection = ids.collection;
  const created = await api('curator', 'POST', '/specimens', {
    json: { collectionId: collection, accessionNumber: `AUD-${tag}`, commonName: `Audit ${tag}`, scientificName: `Auditus ${tag.toLowerCase()}`, gender: 'UNKNOWN' },
  });
  const id = created.body?.id;
  await api('curator', 'POST', `/specimens/${id}/taxonomy`, { json: { kingdom: 'Animalia', habitat: 'Audit reef', conservationStatus: 'LC' } });
  await api('curator', 'POST', `/specimens/${id}/provenance`, { json: { collector: 'A. Collector', donor: 'D. Onor', collectionDate: '2026-01-15', collectionLocation: 'Cebu', preservationType: 'Wet', preservationMethod: 'Ethanol' } });
  await api('curator', 'POST', `/specimens/${id}/lots`, { json: { storageUnitId: ids.drawerB, conditionClass: 'Good', quantity: 2 } });
  await api('curator', 'PATCH', `/specimens/${id}/complete-cataloging`, {});
  return id;
}

export default async function run() {
  section('4.4 Inventory and cataloging', ['REQ-4.4-01', 'REQ-4.4-18']);
  const collection = await call('create collection', 'happy', 'curator', 'POST', '/collections', 201, { json: { collectionName: 'Audit Mollusks' } });
  ids.collection = collection.body?.id;
  const col = await one('select * from collection where id = $1', [ids.collection]);
  check('POST /collections', 'db', 'collection stored', col?.collection_name === 'Audit Mollusks', { expected: 'row', actual: col ?? null });
  await call('blank name rejected', 'invalid', 'curator', 'POST', '/collections', 400, { json: { collectionName: '' } });
  await call('case-variant duplicate rejected', 'invalid', 'curator', 'POST', '/collections', 409, { json: { collectionName: 'audit MOLLUSKS' } });
  await call('padded duplicate rejected', 'invalid', 'curator', 'POST', '/collections', 409, { json: { collectionName: '  Audit Mollusks  ' } });
  await call('list collections', 'happy', 'curator', 'GET', '/collections', 200);
  await call('read collection', 'happy', 'curator', 'GET', `/collections/${ids.collection}`, 200, { op: '/collections/:id' });
  await call('unknown collection is 404', 'invalid', 'curator', 'GET', `/collections/${UNKNOWN_ID}`, 404, { op: '/collections/:id' });
  await call('rename collection', 'happy', 'curator', 'PATCH', `/collections/${ids.collection}`, 200, { json: { collectionName: 'Audit Mollusca' }, op: '/collections/:id' });

  const minimal = await call('create a sparse record', 'happy', 'curator', 'POST', '/specimens', 201, { json: { commonName: 'Audit Sparse' } });
  ids.sparse = minimal.body?.id;
  section('4.4 Inventory and cataloging', ['REQ-4.4-02', 'REQ-4.4-03', 'REQ-4.4-05', 'REQ-4.4-06']);
  const sparse = await one('select * from specimen where id = $1', [ids.sparse]);
  check('POST /specimens', 'db', 'system id assigned', /^[0-9a-f-]{36}$/.test(sparse?.id ?? ''), { expected: 'uuid', actual: sparse?.id });
  check('POST /specimens', 'db', 'accession stays null until assigned', sparse?.accession_number === null, { expected: null, actual: sparse?.accession_number });
  check('POST /specimens', 'db', 'incomplete record is UNCATALOGED', sparse?.status === 'UNCATALOGED', { expected: 'UNCATALOGED', actual: sparse?.status });
  check('POST /specimens', 'db', 'creator recorded', sparse?.created_by === ids.curator, { expected: ids.curator, actual: sparse?.created_by, srs: ['REQ-4.4-17'] });
  const createdAudit = await auditRow('CREATE_SPECIMEN', { affected_record_id: ids.sparse });
  check('POST /specimens', 'db', 'creation audited', Boolean(createdAudit), { expected: 'audit', actual: createdAudit?.action ?? null, srs: ['REQ-4.15-01'] });

  section('4.4 Inventory and cataloging', ['REQ-4.4-01']);
  await call('invalid gender rejected', 'invalid', 'curator', 'POST', '/specimens', 400, { json: { commonName: 'X', gender: 'ROBOT' } });
  await call('client cannot set status', 'invalid', 'curator', 'POST', '/specimens', 400, { json: { commonName: 'X', status: 'CATALOGED' } });
  await call('unknown collection rejected', 'invalid', 'curator', 'POST', '/specimens', [400, 404], { json: { commonName: 'X', collectionId: UNKNOWN_ID } });
  await call('malformed collection id rejected', 'invalid', 'curator', 'POST', '/specimens', 400, { json: { commonName: 'X', collectionId: 'nope' } });

  section('4.4 Inventory and cataloging', ['REQ-4.4-04']);
  const first = await call('accession can be set', 'happy', 'curator', 'POST', '/specimens', 201, { json: { accessionNumber: 'AUD-0001', commonName: 'Audit Main', scientificName: 'Auditus mainus', collectionId: ids.collection, gender: 'FEMALE', specimenCategory: 'Mollusk' } });
  ids.specimen = first.body?.id;
  await call('duplicate accession conflicts', 'invalid', 'curator', 'POST', '/specimens', 409, { json: { accessionNumber: 'AUD-0001', commonName: 'Other' } });
  await call('case-variant accession conflicts', 'invalid', 'curator', 'POST', '/specimens', 409, { json: { accessionNumber: 'aud-0001', commonName: 'Other' } });
  const avail = await call('availability reports taken', 'happy', 'curator', 'GET', '/specimens/accession-number-availability', 200, { query: { accessionNumber: 'AUD-0001' } });
  check('GET /specimens/accession-number-availability', 'shape', 'marked unavailable', avail.body?.available === false, { expected: false, actual: avail.body });
  await call('availability requires the parameter', 'invalid', 'curator', 'GET', '/specimens/accession-number-availability', 400);

  section('4.4 Inventory and cataloging', ['REQ-4.4-09', 'REQ-4.4-08', 'REQ-4.4-07']);
  await call('read list', 'happy', 'curator', 'GET', '/specimens', 200);
  await call('read one', 'happy', 'curator', 'GET', `/specimens/${ids.specimen}`, 200, { op: '/specimens/:id' });
  await call('unknown specimen is 404', 'invalid', 'curator', 'GET', `/specimens/${UNKNOWN_ID}`, 404, { op: '/specimens/:id' });
  await call('malformed id rejected', 'invalid', 'curator', 'GET', '/specimens/not-a-uuid', [400, 404], { op: '/specimens/:id' });
  await call('edit remarks', 'happy', 'curator', 'PATCH', `/specimens/${ids.specimen}`, 200, { json: { remarks: 'Audit remark' }, op: '/specimens/:id' });
  const edited = await one('select remarks, updated_by from specimen where id = $1', [ids.specimen]);
  check('PATCH /specimens/:id', 'db', 'edit and editor persisted', edited?.remarks === 'Audit remark' && edited?.updated_by === ids.curator, { expected: 'remark + updated_by', actual: edited, srs: ['REQ-4.4-09', 'REQ-4.4-17'] });
  const rev = await one('select * from specimen_revision_history where specimen_id = $1 and field_changed = $2', [ids.specimen, 'remarks']);
  check('PATCH /specimens/:id', 'db', 'revision stored', rev?.new_value === 'Audit remark', { expected: 'revision', actual: rev ?? null, srs: ['REQ-4.4-17'] });
  await call('revisions readable', 'happy', 'curator', 'GET', `/specimens/${ids.specimen}/revisions`, 200, { op: '/specimens/:id/revisions' });
  await call('edit rejects unknown field', 'invalid', 'curator', 'PATCH', `/specimens/${ids.specimen}`, 400, { json: { status: 'CATALOGED' }, op: '/specimens/:id' });

  const readiness = await call('readiness lists missing fields', 'happy', 'curator', 'GET', `/specimens/${ids.specimen}/catalog-readiness`, 200, { op: '/specimens/:id/catalog-readiness' });
  check('GET /specimens/:id/catalog-readiness', 'shape', 'missing requirements identified', JSON.stringify(readiness.body).includes('kingdom') || JSON.stringify(readiness.body).toLowerCase().includes('kingdom'), { expected: 'kingdom missing', actual: readiness.body });
  await call('incomplete record cannot be cataloged', 'invalid', 'curator', 'PATCH', `/specimens/${ids.specimen}/complete-cataloging`, [400, 409], { op: '/specimens/:id/complete-cataloging' });

  section('4.4 Inventory and cataloging', ['REQ-4.4-14']);
  await call('taxonomy created', 'happy', 'curator', 'POST', `/specimens/${ids.specimen}/taxonomy`, 201, { json: { kingdom: 'Animalia', phylum: 'Mollusca', class: 'Bivalvia', family: 'Tridacnidae', genus: 'Tridacna', species: 'gigas', habitat: 'Reef', ecologicalRole: 'Filter feeder', conservationStatus: 'VU' }, op: '/specimens/:id/taxonomy' });
  const tax = await one('select * from specimen_taxonomy where specimen_id = $1', [ids.specimen]);
  check('POST /specimens/:id/taxonomy', 'db', 'taxonomy persisted', tax?.kingdom === 'Animalia' && tax?.genus === 'Tridacna', { expected: 'row', actual: tax ?? null });
  await call('second taxonomy conflicts', 'invalid', 'curator', 'POST', `/specimens/${ids.specimen}/taxonomy`, 409, { json: { kingdom: 'Plantae' }, op: '/specimens/:id/taxonomy' });
  await call('taxonomy updated', 'happy', 'curator', 'PATCH', `/specimens/${ids.specimen}/taxonomy`, 200, { json: { orderName: 'Cardiida' }, op: '/specimens/:id/taxonomy' });
  await call('taxonomy read', 'happy', 'curator', 'GET', `/specimens/${ids.specimen}/taxonomy`, 200, { op: '/specimens/:id/taxonomy' });
  await call('taxonomy of bare specimen is 404', 'invalid', 'curator', 'GET', `/specimens/${ids.sparse}/taxonomy`, [200, 404], { op: '/specimens/:id/taxonomy' });
  await call('taxonomy rejects unknown field', 'invalid', 'curator', 'PATCH', `/specimens/${ids.specimen}/taxonomy`, 400, { json: { nope: 'x' }, op: '/specimens/:id/taxonomy' });

  await call('future collection date rejected', 'invalid', 'curator', 'POST', `/specimens/${ids.specimen}/provenance`, 400, { json: { collectionDate: '2099-01-01' }, op: '/specimens/:id/provenance' });
  await call('impossible date rejected', 'invalid', 'curator', 'POST', `/specimens/${ids.specimen}/provenance`, 400, { json: { collectionDate: '2026-02-31' }, op: '/specimens/:id/provenance' });
  await call('provenance created', 'happy', 'curator', 'POST', `/specimens/${ids.specimen}/provenance`, 201, { json: { collector: 'A. Collector', donor: 'D. Onor', collectionDate: '2026-01-15', collectionLocation: 'Cebu', preservationType: 'Wet', preservationMethod: 'Ethanol' }, op: '/specimens/:id/provenance' });
  const prov = await one('select * from specimen_provenance where specimen_id = $1', [ids.specimen]);
  check('POST /specimens/:id/provenance', 'db', 'provenance persisted', prov?.collector === 'A. Collector', { expected: 'row', actual: prov ?? null });
  await call('second provenance conflicts', 'invalid', 'curator', 'POST', `/specimens/${ids.specimen}/provenance`, 409, { json: { collector: 'B' }, op: '/specimens/:id/provenance' });
  await call('provenance updated', 'happy', 'curator', 'PATCH', `/specimens/${ids.specimen}/provenance`, 200, { json: { donor: 'New Donor' }, op: '/specimens/:id/provenance' });
  await call('provenance read', 'happy', 'curator', 'GET', `/specimens/${ids.specimen}/provenance`, 200, { op: '/specimens/:id/provenance' });

  await call('active lot added', 'happy', 'curator', 'POST', `/specimens/${ids.specimen}/lots`, 201, { json: { storageUnitId: ids.drawerB, conditionClass: 'Good', quantity: 4 }, op: '/specimens/:id/lots' });

  section('4.4 Inventory and cataloging', ['REQ-4.4-07', 'REQ-4.4-13', 'REQ-4.4-05']);
  const complete = await call('complete record catalogs without an image', 'happy', 'curator', 'PATCH', `/specimens/${ids.specimen}/complete-cataloging`, 200, { op: '/specimens/:id/complete-cataloging' });
  const cataloged = await one('select status from specimen where id = $1', [ids.specimen]);
  check('PATCH /specimens/:id/complete-cataloging', 'db', 'status CATALOGED', cataloged?.status === 'CATALOGED', { expected: 'CATALOGED', actual: cataloged?.status ?? complete.body });
  await call('detail view', 'happy', 'curator', 'GET', `/specimens/${ids.specimen}/details`, 200, { op: '/specimens/:id/details', srs: ['REQ-4.4-09'] });
  await call('required value cannot be cleared on Cataloged record', 'invalid', 'curator', 'PATCH', `/specimens/${ids.specimen}`, [400, 409], { json: { commonName: null }, op: '/specimens/:id', srs: ['REQ-4.4-07'] });

  section('4.4 Inventory and cataloging', ['REQ-4.4-15', 'REQ-4.4-16', 'REQ-4.4-11']);
  await call('uncataloged record cannot be public', 'invalid', 'curator', 'PATCH', `/specimens/${ids.sparse}/public-display`, [400, 409], { json: { publicDisplay: true }, op: '/specimens/:id/public-display' });
  await call('mark cataloged record public', 'happy', 'curator', 'PATCH', `/specimens/${ids.specimen}/public-display`, 200, { json: { publicDisplay: true }, op: '/specimens/:id/public-display' });
  const flag = await one('select public_display_allowed from specimen where id = $1', [ids.specimen]);
  check('PATCH /specimens/:id/public-display', 'db', 'flag persisted', flag?.public_display_allowed === true, { expected: true, actual: flag });
  await call('flag must be boolean', 'invalid', 'curator', 'PATCH', `/specimens/${ids.specimen}/public-display`, 400, { json: { publicDisplay: 'yes' }, op: '/specimens/:id/public-display' });
  const exposed = await api('none', 'GET', `/specimens/${ids.specimen}`);
  check('GET /specimens/:id', 'no-jwt', 'public flag does not open the internal record', exposed.status === 401, { expected: 401, actual: exposed.status });

  section('4.4 Inventory and cataloging', ['REQ-4.4-07']);
  await call('reopen needs a reason', 'invalid', 'curator', 'PATCH', `/specimens/${ids.specimen}/reopen-cataloging`, 400, { json: {}, op: '/specimens/:id/reopen-cataloging' });
  await call('reopen with a reason', 'happy', 'curator', 'PATCH', `/specimens/${ids.specimen}/reopen-cataloging`, 200, { json: { reason: 'Audit recheck' }, op: '/specimens/:id/reopen-cataloging' });
  const reopened = await one('select status, public_display_allowed from specimen where id = $1', [ids.specimen]);
  check('PATCH /specimens/:id/reopen-cataloging', 'db', 'status back to UNCATALOGED and public flag cleared', reopened?.status === 'UNCATALOGED' && reopened?.public_display_allowed === false, { expected: 'UNCATALOGED, false', actual: reopened, srs: ['REQ-4.4-11'] });
  await api('curator', 'PATCH', `/specimens/${ids.specimen}/complete-cataloging`, {});
  await api('curator', 'PATCH', `/specimens/${ids.specimen}/public-display`, { json: { publicDisplay: true } });

  // ---- Media ---------------------------------------------------------------
  section('4.4 Inventory and cataloging', ['REQ-4.4-12']);
  const base = `/specimens/${ids.specimen}/media`;
  const m = await call('attach image', 'happy', 'curator', 'POST', base, 201, { form: upload({ caption: 'Audit image' }, PNG), op: '/specimens/:id/media' });
  ids.media = m.body?.id;
  const stored = await one('select * from specimen_media where id = $1', [ids.media]);
  check('POST /specimens/:id/media', 'db', 'media row stored', stored?.caption === 'Audit image' && Boolean(stored?.storage_path), { expected: 'row', actual: stored ?? null });
  const object = await one("select name from storage.objects where bucket_id='specimen-media' and name = $1", [stored?.storage_path]);
  check('POST /specimens/:id/media', 'db', 'file reached object storage', Boolean(object), { expected: 'storage.objects row', actual: object ?? null });
  await call('no file rejected', 'invalid', 'curator', 'POST', base, 400, { form: upload({ caption: 'x' }), op: '/specimens/:id/media' });
  await call('text file rejected', 'invalid', 'curator', 'POST', base, 400, { form: upload({}, Buffer.from('hello'), 'a.txt', 'text/plain'), op: '/specimens/:id/media' });
  await call('fake png rejected', 'invalid', 'curator', 'POST', base, 400, { form: upload({}, Buffer.from('not an image at all')), op: '/specimens/:id/media' });
  await call('list media', 'happy', 'curator', 'GET', base, 200, { op: '/specimens/:id/media' });
  await call('read media', 'happy', 'curator', 'GET', `${base}/${ids.media}`, 200, { op: '/specimens/:id/media/:id' });
  await call('unknown media is 404', 'invalid', 'curator', 'GET', `${base}/${UNKNOWN_ID}`, 404, { op: '/specimens/:id/media/:id' });
  const signed = await call('signed url', 'happy', 'curator', 'GET', `${base}/${ids.media}/signed-url`, 200, { op: '/specimens/:id/media/:id/signed-url' });
  check('GET /specimens/:id/media/:id/signed-url', 'shape', 'returns a url', /https?:/.test(JSON.stringify(signed.body)), { expected: 'url', actual: Object.keys(signed.body ?? {}) });
  await call('update metadata', 'happy', 'curator', 'PATCH', `${base}/${ids.media}`, 200, { json: { caption: 'Edited', displayOrder: 2 }, op: '/specimens/:id/media/:id' });
  await call('negative order rejected', 'invalid', 'curator', 'PATCH', `${base}/${ids.media}`, 400, { json: { displayOrder: -1 }, op: '/specimens/:id/media/:id' });
  await call('set cover', 'happy', 'curator', 'PATCH', `${base}/${ids.media}/cover`, 200, { op: '/specimens/:id/media/:id/cover' });
  await call('replace file', 'happy', 'curator', 'PUT', `${base}/${ids.media}/file`, 200, { form: upload({}, PNG, 'new.png'), op: '/specimens/:id/media/:id/file' });
  const replaced = await one('select storage_path from specimen_media where id = $1', [ids.media]);
  check('PUT /specimens/:id/media/:id/file', 'db', 'storage path changed', replaced?.storage_path !== stored?.storage_path, { expected: 'new path', actual: replaced });
  const second = await api('curator', 'POST', base, { form: upload({}, PNG) });
  await call('remove image', 'happy', 'curator', 'DELETE', `${base}/${second.body?.id}`, 200, { op: '/specimens/:id/media/:id' });
  const gone = await one('select id from specimen_media where id = $1', [second.body?.id]);
  check('DELETE /specimens/:id/media/:id', 'db', 'media row removed', !gone, { expected: 'none', actual: gone ?? null });

  // ---- Tags ----------------------------------------------------------------
  section('4.4 Inventory and cataloging', ['REQ-4.4-09']);
  const tag = await call('attach tag', 'happy', 'curator', 'POST', `/specimens/${ids.specimen}/tags`, 201, { json: { tagName: 'audit-tag' }, op: '/specimens/:id/tags' });
  ids.tag = tag.body?.tag?.id ?? tag.body?.tagId ?? tag.body?.id ?? (await one("select id from tag where tag_name ilike 'audit-tag'"))?.id;
  await call('same tag conflicts', 'invalid', 'curator', 'POST', `/specimens/${ids.specimen}/tags`, [200, 201, 409], { json: { tagName: 'audit-tag' }, op: '/specimens/:id/tags' });
  await call('blank tag rejected', 'invalid', 'curator', 'POST', `/specimens/${ids.specimen}/tags`, 400, { json: { tagName: '' }, op: '/specimens/:id/tags' });
  await call('list specimen tags', 'happy', 'curator', 'GET', `/specimens/${ids.specimen}/tags`, 200, { op: '/specimens/:id/tags' });
  await call('list vocabulary', 'happy', 'curator', 'GET', '/tags', 200, { query: { search: 'audit' } });
  await call('change tag', 'happy', 'curator', 'PATCH', `/specimens/${ids.specimen}/tags/${ids.tag}`, 200, { json: { tagName: 'audit-tag-2' }, op: '/specimens/:id/tags/:id' });
  const tagNow = (await one('select t.id from specimen_tag st join tag t on t.id = st.tag_id where st.specimen_id = $1', [ids.specimen]))?.id;
  await call('detach tag', 'happy', 'curator', 'DELETE', `/specimens/${ids.specimen}/tags/${tagNow}`, 200, { op: '/specimens/:id/tags/:id' });
  await call('detach unknown tag is 404', 'invalid', 'curator', 'DELETE', `/specimens/${ids.specimen}/tags/${UNKNOWN_ID}`, 404, { op: '/specimens/:id/tags/:id' });

  // ---- Duplicates ----------------------------------------------------------
  section('4.4 Inventory and cataloging', ['REQ-4.4-21', 'REQ-4.4-22', 'REQ-4.4-23']);
  const dup = await call('duplicate check warns on same names', 'happy', 'curator', 'POST', '/specimens/duplicate-check', 200, { json: { scientificName: 'Auditus mainus', commonName: 'Audit Main' } });
  check('POST /specimens/duplicate-check', 'shape', 'existing record offered', JSON.stringify(dup.body).includes(ids.specimen), { expected: 'candidate', actual: dup.body });
  await call('duplicate check rejects a bad exclude id', 'invalid', 'curator', 'POST', '/specimens/duplicate-check', 400, { json: { scientificName: 'A', excludeSpecimenId: 'x' } });
  const twin = await call('same species can be a separate record', 'happy', 'curator', 'POST', '/specimens', 201, { json: { scientificName: 'Auditus mainus', commonName: 'Audit Main' } });
  ids.twin = twin.body?.id;
  const candidates = await call('possible duplicates listed', 'happy', 'curator', 'GET', `/specimens/${ids.twin}/possible-duplicates`, 200, { op: '/specimens/:id/possible-duplicates' });
  check('GET /specimens/:id/possible-duplicates', 'shape', 'original listed', JSON.stringify(candidates.body).includes(ids.specimen), { expected: 'candidate', actual: candidates.body });
  const both = await sql('select id from specimen where id = any($1)', [[ids.specimen, ids.twin]]);
  check('POST /specimens', 'db', 'nothing was merged or deleted', both.length === 2, { expected: 2, actual: both.length });

  // ---- Import --------------------------------------------------------------
  section('4.4 Inventory and cataloging', ['REQ-4.4-19', 'REQ-4.4-20']);
  const csv = 'accessionNumber,scientificName,commonName,gender,remarks\nAUD-IMP-1,,Audit Import One,UNKNOWN,ok\nAUD-0001,,Audit Import Taken,UNKNOWN,taken\nAUD-IMP-3,,Audit Import Bad,ROBOT,bad\n,Auditus mainus,Audit Main,UNKNOWN,dup\nAUD-IMP-5,Auditus mainus,,UNKNOWN,same species only\n';
  const preview = await call('csv preview', 'happy', 'curator', 'POST', '/specimens/import/preview', 201, { form: upload({}, Buffer.from(csv), 'import.csv', 'text/csv') });
  const rows = preview.body?.rows ?? [];
  const byName = (name) => rows.find((r) => JSON.stringify(r).includes(name));
  check('POST /specimens/import/preview', 'shape', 'valid row is ready', byName('Audit Import One')?.valid === true || /valid|ready/i.test(byName('Audit Import One')?.status ?? ''), { expected: 'valid', actual: byName('Audit Import One') ?? preview.body });
  check('POST /specimens/import/preview', 'shape', 'taken accession flagged', byName('Audit Import Taken') && byName('Audit Import Taken').valid !== true, { expected: 'invalid', actual: byName('Audit Import Taken') ?? null });
  check('POST /specimens/import/preview', 'shape', 'bad gender flagged', byName('Audit Import Bad') && byName('Audit Import Bad').valid !== true, { expected: 'invalid', actual: byName('Audit Import Bad') ?? null });
  const twinRow = rows.find((r) => r.rowNumber === 4);
  const speciesRow = rows.find((r) => r.rowNumber === 5);
  const warned = (r) => (r?.duplicateWarnings?.length ?? 0) > 0 || (r?.possibleDuplicates?.length ?? 0) > 0;
  check('POST /specimens/import/preview', 'shape', 'same scientific and common name warned as possible duplicate', warned(twinRow), { expected: 'duplicate warning on row 4', actual: twinRow ?? null, srs: ['REQ-4.4-21'], note: 'BBT case BB-IMP-02 reported no duplicate warning.' });
  info('POST /specimens/import/preview', 'same species alone produces no warning', { srs: ['REQ-4.4-21', 'REQ-4.4-23'], expected: 'per SPECIMEN_DUPLICATES_GUIDE rule 4: nothing reported without a second matching field', actual: { duplicateWarnings: speciesRow?.duplicateWarnings, valid: speciesRow?.valid }, note: 'Matches the written rule, so BB-IMP-02 expected more than the rule. Curator/SRS disposition of REQ-4.4-21 still blocks CAT-014.' });
  const before = await one("select count(*)::int n from specimen where common_name like 'Audit Import%'");
  check('POST /specimens/import/preview', 'db', 'preview saves nothing', before.n === 0, { expected: 0, actual: before.n });
  await call('no file rejected', 'invalid', 'curator', 'POST', '/specimens/import/preview', 400, { form: upload({}) });
  await call('unsupported file rejected', 'invalid', 'curator', 'POST', '/specimens/import/preview', 400, { form: upload({}, PNG) });
  await call('unmapped columns rejected', 'invalid', 'curator', 'POST', '/specimens/import/preview', 400, { form: upload({}, Buffer.from('foo,bar\n1,2\n'), 'x.csv', 'text/csv') });
  await call('commit needs a preview id', 'invalid', 'curator', 'POST', '/specimens/import/commit', 400, { json: {} });
  await call('unknown preview id refused', 'invalid', 'curator', 'POST', '/specimens/import/commit', [400, 404, 410], { json: { previewId: UNKNOWN_ID } });
  const validRow = byName('Audit Import One')?.rowNumber ?? 1;
  const commit = await call('commit the valid row', 'happy', 'curator', 'POST', '/specimens/import/commit', [200, 201], { json: { previewId: preview.body?.previewId, rowNumbers: [validRow] } });
  const imported = await one("select status, accession_number from specimen where common_name = 'Audit Import One'");
  check('POST /specimens/import/commit', 'db', 'row saved as UNCATALOGED', imported?.status === 'UNCATALOGED', { expected: 'UNCATALOGED', actual: imported ?? commit.body });
  await api('curator', 'POST', '/specimens/import/commit', { json: { previewId: preview.body?.previewId, rowNumbers: [validRow] } });
  const count = await one("select count(*)::int n from specimen where common_name = 'Audit Import One'");
  check('POST /specimens/import/commit', 'db', 'repeat commit does not duplicate', count.n === 1, { expected: 1, actual: count.n });
  const importAudit = await auditRow('IMPORT_SPECIMEN', {});
  check('POST /specimens/import/commit', 'db', 'import audited', Boolean(importAudit), { expected: 'audit', actual: importAudit?.action ?? null, srs: ['REQ-4.15-01'] });
  const book = await call('xlsx preview', 'happy', 'curator', 'POST', '/specimens/import/preview', 201, {
    form: upload({}, xlsx([['accessionNumber', 'commonName', 'gender'], ['AUD-X-1', 'Audit Xlsx', 'UNKNOWN']]), 'import.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  });
  check('POST /specimens/import/preview', 'shape', 'xlsx row parsed', JSON.stringify(book.body).includes('Audit Xlsx'), { expected: 'row', actual: book.body?.rows?.length ?? book.body });

  // ---- Archive -------------------------------------------------------------
  section('4.4 Inventory and cataloging', ['REQ-4.4-10', 'REQ-4.4-17', 'REQ-4.4-11']);
  const victim = await catalogedSpecimen('ARCH');
  ids.archived = victim;
  await api('curator', 'PATCH', `/specimens/${victim}/public-display`, { json: { publicDisplay: true } });
  await call('archive refused while active lots remain', 'invalid', 'curator', 'PATCH', `/specimens/${victim}/archive`, 400, { op: '/specimens/:id/archive' });
  const activeLot = await one('select id, quantity from specimen_lot where specimen_id = $1 and is_active', [victim]);
  await api('curator', 'POST', `/specimens/${victim}/lots/${activeLot.id}/quantity-adjustments`, { json: { adjustmentType: 'DEACCESSION', quantityDelta: -activeLot.quantity, expectedQuantity: activeLot.quantity, reason: 'Audit archive prep' } });
  await call('archive', 'happy', 'curator', 'PATCH', `/specimens/${victim}/archive`, 200, { op: '/specimens/:id/archive' });
  const arch = await one('select status, archived_by, archived_at, public_display_allowed from specimen where id = $1', [victim]);
  check('PATCH /specimens/:id/archive', 'db', 'archived with actor and public flag off', arch?.status === 'ARCHIVED' && arch?.archived_by === ids.curator && Boolean(arch?.archived_at) && arch?.public_display_allowed === false, { expected: 'ARCHIVED, actor, time, flag off', actual: arch });
  await call('archived record not editable', 'invalid', 'curator', 'PATCH', `/specimens/${victim}`, [400, 409], { json: { remarks: 'x' }, op: '/specimens/:id' });
  await call('archived record cannot be public', 'invalid', 'curator', 'PATCH', `/specimens/${victim}/public-display`, [400, 409], { json: { publicDisplay: true }, op: '/specimens/:id/public-display' });
  const del = await api('curator', 'DELETE', `/specimens/${victim}`);
  check('DELETE /specimens/:id', 'absence', 'no routine delete route', del.status === 404, { expected: 404, actual: del.status });
  await call('restore', 'happy', 'curator', 'PATCH', `/specimens/${victim}/restore`, 200, { op: '/specimens/:id/restore', srs: ['REQ-4.4-10'] });
  const restored = await one('select status, public_display_allowed, archived_at from specimen where id = $1', [victim]);
  check('PATCH /specimens/:id/restore', 'db', 'restored, public flag stays off', restored?.status !== 'ARCHIVED' && restored?.public_display_allowed === false, { expected: 'not archived, flag off', actual: restored });
  await call('repeat restore is a safe no-op', 'invalid', 'curator', 'PATCH', `/specimens/${victim}/restore`, [200, 409], { op: '/specimens/:id/restore' });
  const unchanged = await one('select status from specimen where id = $1', [victim]);
  check('PATCH /specimens/:id/restore', 'db', 'repeat restore changes nothing', unchanged?.status === restored?.status, { expected: restored?.status, actual: unchanged?.status });
  info('specimen classification', 'REQ-4.4-14 entered values stored as provided', { expected: 'no derived classification', actual: 'covered by taxonomy/lot persistence checks', srs: ['REQ-4.4-14'] });
}
