// SRS 4.6: storage hierarchy. Lot-related storage checks run in suite 40.
import { api, auditRow, call, check, ids, info, one, section, sql, UNKNOWN_ID } from '../lib.mjs';

const unit = (label, unitType, parentId, extra = {}) => ({
  label, unitType, storageType: 'DRY', holdsSpecimens: false, ...(parentId ? { parentId } : {}), ...extra,
});

export default async function run() {
  section('4.6 Storage locations', ['REQ-4.6-01', 'REQ-4.6-02', 'REQ-4.6-03', 'REQ-4.6-04']);
  const room = await call('create top-level room', 'happy', 'curator', 'POST', '/storage-locations', 201, { json: unit('Audit Room', 'ROOM') });
  ids.room = room.body?.id;
  const cabinet = await call('create cabinet in room', 'happy', 'curator', 'POST', '/storage-locations', 201, { json: unit('Audit Cabinet', 'CABINET', ids.room) });
  ids.cabinet = cabinet.body?.id;
  const drawer = await call('create drawer with capacity', 'happy', 'curator', 'POST', '/storage-locations', 201, {
    json: unit('Audit Drawer A', 'DRAWER', ids.cabinet, { holdsSpecimens: true, capacity: 3 }),
  });
  ids.drawerA = drawer.body?.id;
  const drawerB = await call('create second drawer', 'happy', 'curator', 'POST', '/storage-locations', 201, {
    json: unit('Audit Drawer B', 'DRAWER', ids.cabinet, { holdsSpecimens: true }),
  });
  ids.drawerB = drawerB.body?.id;
  for (const type of ['GALLERY', 'SHELF', 'BOX', 'VIAL']) {
    await call(`supports unit type ${type}`, 'happy', 'curator', 'POST', '/storage-locations', 201, {
      json: unit(`Audit ${type}`, type, type === 'GALLERY' ? undefined : ids.cabinet, { holdsSpecimens: type !== 'GALLERY' }),
      srs: ['REQ-4.6-01'],
    });
  }
  const row = await one('select * from storage_unit where id = $1', [ids.drawerA]);
  check('POST /storage-locations', 'db', 'unit fields persisted', row?.label === 'Audit Drawer A' && row?.parent_id === ids.cabinet && row?.holds_specimens === true && row?.capacity === 3, {
    expected: 'label, parent, holds, capacity', actual: row ?? null,
  });
  const created = await auditRow('CREATE_STORAGE_UNIT', { affected_record_id: ids.drawerA });
  check('POST /storage-locations', 'db', 'creation audited', Boolean(created), { expected: 'audit row', actual: created?.action ?? null, srs: ['REQ-4.15-01'] });

  await call('missing label rejected', 'invalid', 'curator', 'POST', '/storage-locations', 400, { json: { unitType: 'ROOM', storageType: 'DRY' } });
  await call('capacity of zero rejected', 'invalid', 'curator', 'POST', '/storage-locations', 400, { json: unit('X', 'BOX', ids.cabinet, { capacity: 0 }) });
  await call('unknown parent rejected', 'invalid', 'curator', 'POST', '/storage-locations', [400, 404], { json: unit('X', 'BOX', UNKNOWN_ID) });

  await call('list units', 'happy', 'curator', 'GET', '/storage-locations', 200);
  await call('read unit', 'happy', 'curator', 'GET', `/storage-locations/${ids.drawerA}`, 200, { op: '/storage-locations/:id' });
  await call('unknown unit is 404', 'invalid', 'curator', 'GET', `/storage-locations/${UNKNOWN_ID}`, 404, { op: '/storage-locations/:id' });
  await call('malformed id rejected', 'invalid', 'curator', 'GET', '/storage-locations/not-a-uuid', [400, 404], { op: '/storage-locations/:id' });
  const children = await call('children of cabinet', 'happy', 'curator', 'GET', `/storage-locations/${ids.cabinet}/children`, 200, { op: '/storage-locations/:id/children' });
  check('GET /storage-locations/:id/children', 'shape', 'drawers listed', JSON.stringify(children.body).includes('Audit Drawer A'), { expected: 'child unit', actual: Array.isArray(children.body) ? children.body.length : children.body });
  const search = await call('search', 'happy', 'curator', 'GET', '/storage-locations/search', 200, { query: { search: 'Drawer A' } });
  check('GET /storage-locations/search', 'shape', 'search finds the drawer', JSON.stringify(search.body).includes('Audit Drawer A'), { expected: 'match', actual: search.body?.total ?? null });
  await call('search rejects a bad limit', 'invalid', 'curator', 'GET', '/storage-locations/search', 400, { query: { limit: 0 } });

  section('4.6 Storage locations', ['REQ-4.6-08']);
  const path = await call('path derives the room', 'happy', 'curator', 'GET', `/storage-locations/${ids.drawerA}/path`, 200, { op: '/storage-locations/:id/path' });
  check('GET /storage-locations/:id/path', 'shape', 'root of the path is the room', JSON.stringify(path.body).includes('Audit Room'), { expected: 'Audit Room in path', actual: path.body });

  section('4.6 Storage locations', ['REQ-4.6-02']);
  await call('update label', 'happy', 'curator', 'PATCH', `/storage-locations/${ids.drawerB}`, 200, { json: { label: 'Audit Drawer B2' }, op: '/storage-locations/:id' });
  const renamed = await one('select label from storage_unit where id = $1', [ids.drawerB]);
  check('PATCH /storage-locations/:id', 'db', 'label persisted', renamed?.label === 'Audit Drawer B2', { expected: 'Audit Drawer B2', actual: renamed?.label });
  await call('update rejects an unknown field', 'invalid', 'curator', 'PATCH', `/storage-locations/${ids.drawerB}`, 400, { json: { parentId: ids.room }, op: '/storage-locations/:id' });

  section('4.6 Storage locations', ['REQ-4.6-07']);
  const extra = await api('curator', 'POST', '/storage-locations', { json: unit('Audit Cabinet 2', 'CABINET', ids.room) });
  ids.cabinet2 = extra.body?.id;
  const inner = await api('curator', 'POST', '/storage-locations', { json: unit('Audit Inner Box', 'BOX', ids.cabinet2, { holdsSpecimens: true }) });
  ids.innerBox = inner.body?.id;
  const gallery = (await sql("select id from storage_unit where label='Audit GALLERY'"))[0]?.id;
  await call('move a container', 'happy', 'curator', 'PATCH', `/storage-locations/${ids.cabinet2}/move`, 200, { json: { newParentId: gallery, reason: 'Audit relocation' }, op: '/storage-locations/:id/move' });
  const moved = await one('select parent_id from storage_unit where id = $1', [ids.cabinet2]);
  const childKept = await one('select parent_id from storage_unit where id = $1', [ids.innerBox]);
  check('PATCH /storage-locations/:id/move', 'db', 'parent changed and children preserved', moved?.parent_id === gallery && childKept?.parent_id === ids.cabinet2, {
    expected: 'new parent; child unchanged', actual: { moved, childKept },
  });
  const history = await one('select * from storage_movement_history where storage_unit_id = $1', [ids.cabinet2]);
  check('PATCH /storage-locations/:id/move', 'db', 'container move recorded', history?.to_storage_unit_id === gallery && history?.reason === 'Audit relocation', { expected: 'history row', actual: history ?? null });
  await call('movement history', 'happy', 'curator', 'GET', `/storage-locations/${ids.cabinet2}/movements`, 200, { op: '/storage-locations/:id/movements' });

  section('4.6 Storage locations', ['REQ-4.6-12']);
  await call('cannot move unit to itself', 'invalid', 'curator', 'PATCH', `/storage-locations/${ids.cabinet}/move`, 400, { json: { newParentId: ids.cabinet }, op: '/storage-locations/:id/move' });
  await call('cannot move unit into a descendant', 'invalid', 'curator', 'PATCH', `/storage-locations/${ids.room}/move`, 400, { json: { newParentId: ids.drawerA }, op: '/storage-locations/:id/move' });
  const invalidNest = await api('curator', 'POST', '/storage-locations', { json: unit('Audit Room In Vial', 'ROOM', ids.innerBox) });
  check('POST /storage-locations', 'invalid', 'invalid parent-child type combination rejected (room inside a box)', invalidNest.status === 400, {
    expected: 400, actual: { status: invalidNest.status, unitType: invalidNest.body?.unitType },
    note: 'SRS requires rejecting invalid parent-child combinations; no allowed-type matrix exists in code.',
  });
  if (invalidNest.body?.id) await sql('delete from storage_unit where id = $1', [invalidNest.body.id]);

  section('4.6 Storage locations', ['REQ-4.6-02']);
  const archive = await api('curator', 'POST', '/storage-locations', { json: unit('Audit Archive Me', 'BOX', ids.cabinet, { holdsSpecimens: true }) });
  await call('archive empty unit', 'happy', 'curator', 'PATCH', `/storage-locations/${archive.body?.id}/archive`, 200, { op: '/storage-locations/:id/archive' });
  const archived = await one('select archived_at from storage_unit where id = $1', [archive.body?.id]);
  check('PATCH /storage-locations/:id/archive', 'db', 'unit archived, not deleted', Boolean(archived?.archived_at), { expected: 'archived_at set', actual: archived ?? null });
  ids.archivedUnit = archive.body?.id;
  await call('archiving a parent with active children refused', 'invalid', 'curator', 'PATCH', `/storage-locations/${ids.cabinet}/archive`, [400, 409], { op: '/storage-locations/:id/archive' });
  await call('archived unit cannot be edited', 'invalid', 'curator', 'PATCH', `/storage-locations/${ids.archivedUnit}`, [400, 409], { json: { label: 'Nope' }, op: '/storage-locations/:id' });
  info('storage restore', 'restoring an archived unit', { expected: 'not required by SRS', actual: 'no route', note: 'REQ-4.6-02 lists archive only.' });
}
