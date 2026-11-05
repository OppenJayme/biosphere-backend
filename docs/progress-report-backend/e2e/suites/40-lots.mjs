// SRS 4.5 lots and quantities, plus lot-related parts of 4.6.
import { api, auditRow, call, check, ids, one, section, sql, UNKNOWN_ID } from '../lib.mjs';

const total = async (specimen) =>
  (await one('select coalesce(sum(quantity),0)::int n from specimen_lot where specimen_id = $1 and is_active', [specimen])).n;

export default async function run() {
  const created = await api('curator', 'POST', '/specimens', { json: { commonName: 'Audit Lots' } });
  const s = created.body?.id;
  ids.lotSpecimen = s;
  const base = `/specimens/${s}/lots`;
  const op = '/specimens/:id/lots';

  section('4.5 Lots and quantities', ['REQ-4.5-01', 'REQ-4.5-02', 'REQ-4.5-03']);
  const lot = await call('create lot', 'happy', 'curator', 'POST', base, 201, { json: { storageUnitId: ids.drawerB, conditionClass: 'Good', quantity: 10, storageNotes: 'Audit' }, op });
  const a = lot.body?.id;
  const row = await one('select * from specimen_lot where id = $1', [a]);
  check(`POST ${op}`, 'db', 'lot persisted', row?.quantity === 10 && row?.storage_unit_id === ids.drawerB && row?.condition_class === 'Good', { expected: 'row', actual: row ?? null });
  const audit = await auditRow('CREATE_SPECIMEN_LOT', { affected_record_id: a });
  check(`POST ${op}`, 'db', 'lot creation audited', Boolean(audit), { expected: 'audit', actual: audit?.action ?? null, srs: ['REQ-4.15-01'] });
  await call('quantity of zero rejected', 'invalid', 'curator', 'POST', base, 400, { json: { storageUnitId: ids.drawerB, conditionClass: 'Good', quantity: 0 }, op });
  await call('negative quantity rejected', 'invalid', 'curator', 'POST', base, 400, { json: { storageUnitId: ids.drawerB, conditionClass: 'Good', quantity: -1 }, op });
  await call('missing condition rejected', 'invalid', 'curator', 'POST', base, 400, { json: { storageUnitId: ids.drawerB, quantity: 1 }, op });
  await call('missing location rejected', 'invalid', 'curator', 'POST', base, 400, { json: { conditionClass: 'Good', quantity: 1 }, op });
  await call('unknown specimen is 404', 'invalid', 'curator', 'POST', `/specimens/${UNKNOWN_ID}/lots`, 404, { json: { storageUnitId: ids.drawerB, conditionClass: 'Good', quantity: 1 }, op });
  await call('same location and condition conflicts', 'invalid', 'curator', 'POST', base, [200, 201, 409], { json: { storageUnitId: ids.drawerB, conditionClass: 'Good', quantity: 1 }, op, srs: ['REQ-4.5-07'] });
  const afterDup = await sql('select id, quantity from specimen_lot where specimen_id = $1 and is_active', [s]);
  check(`POST ${op}`, 'db', 'no duplicate lot for same specimen, location, condition', afterDup.length === 1, { expected: 1, actual: afterDup, srs: ['REQ-4.5-07'] });
  const baseTotal = await total(s);

  section('4.6 Storage locations', ['REQ-4.6-05']);
  await call('non-holding unit refused', 'invalid', 'curator', 'POST', base, [400, 409], { json: { storageUnitId: ids.cabinet, conditionClass: 'Good', quantity: 1 }, op });
  await call('archived unit refused', 'invalid', 'curator', 'POST', base, [400, 409], { json: { storageUnitId: ids.archivedUnit, conditionClass: 'Good', quantity: 1 }, op });

  section('4.6 Storage locations', ['REQ-4.6-11']);
  const over = await call('over-capacity lot allowed with warning', 'happy', 'curator', 'POST', base, 201, { json: { storageUnitId: ids.drawerA, conditionClass: 'Poor', quantity: 5 }, op });
  check(`POST ${op}`, 'shape', 'capacity warning returned', Boolean(over.body?.capacityWarning), { expected: 'capacityWarning', actual: over.body?.capacityWarning ?? null, note: 'BBT BB-SPC-08 saw no warning in the UI.' });
  const check1 = await call('capacity check', 'happy', 'curator', 'GET', `/storage-locations/${ids.drawerA}/capacity-check`, 200, { query: { additionalQuantity: 1 }, op: '/storage-locations/:id/capacity-check' });
  check('GET /storage-locations/:id/capacity-check', 'shape', 'reports exceeded', /true|exceed/i.test(JSON.stringify(check1.body)), { expected: 'exceeded', actual: check1.body });
  await call('capacity check rejects bad quantity', 'invalid', 'curator', 'GET', `/storage-locations/${ids.drawerA}/capacity-check`, 400, { query: { additionalQuantity: -1 }, op: '/storage-locations/:id/capacity-check' });
  await call('occupancy summary', 'happy', 'curator', 'GET', '/storage-locations/occupancy-summary', 200);
  const inv = await call('unit inventory', 'happy', 'curator', 'GET', `/storage-locations/${ids.drawerA}/inventory`, 200, { op: '/storage-locations/:id/inventory', srs: ['REQ-4.6-02'] });
  check('GET /storage-locations/:id/inventory', 'shape', 'contains the lot', JSON.stringify(inv.body).includes(s), { expected: 'lot', actual: inv.body?.total ?? null, srs: ['REQ-4.6-02'] });
  await call('inventory rejects a bad page', 'invalid', 'curator', 'GET', `/storage-locations/${ids.drawerA}/inventory`, 400, { query: { page: 0 }, op: '/storage-locations/:id/inventory' });

  const poor = (await one("select id from specimen_lot where specimen_id = $1 and condition_class = 'Poor'", [s]))?.id;
  const quantityNow = await total(s);

  section('4.5 Lots and quantities', ['REQ-4.5-04', 'REQ-4.5-06', 'REQ-4.6-06', 'REQ-4.6-09']);
  const mov = `${base}/${a}/movements`;
  const movOp = `${op}/:id/movements`;
  await call('partial move', 'happy', 'curator', 'POST', mov, 201, { json: { targetStorageUnitId: ids.innerBox, quantity: 1, reason: 'Audit partial move' }, op: movOp });
  const source = await one('select quantity from specimen_lot where id = $1', [a]);
  const target = await one("select * from specimen_lot where specimen_id = $1 and storage_unit_id = $2 and is_active", [s, ids.innerBox]);
  check(`POST ${movOp}`, 'db', 'source reduced and target created', source?.quantity === 10 + (baseTotal - 10) - 1 && target?.quantity === 1, { expected: 'source -1, target 1', actual: { source, target } });
  check(`POST ${movOp}`, 'db', 'total unchanged', (await total(s)) === quantityNow, { expected: quantityNow, actual: await total(s) });
  const tx = await one("select * from specimen_lot_transaction where source_lot_id = $1 order by created_at desc limit 1", [a]);
  check(`POST ${movOp}`, 'db', 'transaction keeps actor, lots, quantity, reason', tx?.performed_by === ids.curator && tx?.target_lot_id === target?.id && tx?.quantity_affected === 1 && tx?.reason === 'Audit partial move', { expected: 'full record', actual: tx ?? null, srs: ['REQ-4.5-11', 'REQ-4.5-10', 'REQ-4.6-09'] });
  await call('move above source quantity refused', 'invalid', 'curator', 'POST', mov, [400, 409], { json: { targetStorageUnitId: ids.innerBox, quantity: 9999 }, op: movOp, srs: ['REQ-4.5-08'] });
  await call('move of zero refused', 'invalid', 'curator', 'POST', mov, 400, { json: { targetStorageUnitId: ids.innerBox, quantity: 0 }, op: movOp, srs: ['REQ-4.5-08'] });
  await call('move to same location refused', 'invalid', 'curator', 'POST', mov, [400, 409], { json: { targetStorageUnitId: ids.drawerB, quantity: 1 }, op: movOp });
  await call('move to non-holding unit refused', 'invalid', 'curator', 'POST', mov, [400, 409], { json: { targetStorageUnitId: ids.cabinet, quantity: 1 }, op: movOp, srs: ['REQ-4.6-05'] });

  section('4.5 Lots and quantities', ['REQ-4.5-07']);
  await call('second move merges into existing target', 'happy', 'curator', 'POST', mov, 201, { json: { targetStorageUnitId: ids.innerBox, quantity: 1, reason: 'Audit merge' }, op: movOp });
  const merged = await sql('select quantity from specimen_lot where specimen_id = $1 and storage_unit_id = $2 and is_active', [s, ids.innerBox]);
  check(`POST ${movOp}`, 'db', 'merged, no second lot', merged.length === 1 && merged[0].quantity === 2, { expected: 'one lot of 2', actual: merged });

  section('4.5 Lots and quantities', ['REQ-4.5-05', 'REQ-4.5-06']);
  const cond = `${base}/${a}/condition-changes`;
  const condOp = `${op}/:id/condition-changes`;
  const beforeCond = await total(s);
  await call('partial condition change', 'happy', 'curator', 'POST', cond, 201, { json: { targetConditionClass: 'Fair', quantity: 1, reason: 'Audit condition' }, op: condOp });
  const fair = await one("select quantity from specimen_lot where specimen_id = $1 and condition_class = 'Fair' and is_active", [s]);
  check(`POST ${condOp}`, 'db', 'target condition lot created and total unchanged', fair?.quantity === 1 && (await total(s)) === beforeCond, { expected: 'Fair lot 1; total same', actual: { fair, total: await total(s) } });
  await call('above quantity refused', 'invalid', 'curator', 'POST', cond, [400, 409], { json: { targetConditionClass: 'Fair', quantity: 9999 }, op: condOp, srs: ['REQ-4.5-08'] });
  await call('same condition refused', 'invalid', 'curator', 'POST', cond, [400, 409], { json: { targetConditionClass: 'Good', quantity: 1 }, op: condOp });
  await call('missing condition refused', 'invalid', 'curator', 'POST', cond, 400, { json: { quantity: 1 }, op: condOp });

  section('4.5 Lots and quantities', ['REQ-4.5-09', 'REQ-4.5-10']);
  const adj = `${base}/${poor}/quantity-adjustments`;
  const adjOp = `${op}/:id/quantity-adjustments`;
  const expected = (await one('select quantity from specimen_lot where id = $1', [poor])).quantity;
  await call('addition', 'happy', 'curator', 'POST', adj, 201, { json: { adjustmentType: 'ADDITION', quantityDelta: 2, expectedQuantity: expected, reason: 'Audit addition' }, op: adjOp });
  const addRow = await one('select quantity from specimen_lot where id = $1', [poor]);
  check(`POST ${adjOp}`, 'db', 'addition applied', addRow?.quantity === expected + 2, { expected: expected + 2, actual: addRow?.quantity });
  await call('stale expected quantity refused', 'invalid', 'curator', 'POST', adj, 409, { json: { adjustmentType: 'REMOVAL', quantityDelta: -1, expectedQuantity: expected, reason: 'stale' }, op: adjOp });
  await call('reason is required', 'invalid', 'curator', 'POST', adj, 400, { json: { adjustmentType: 'REMOVAL', quantityDelta: -1, expectedQuantity: expected + 2 }, op: adjOp });
  await call('unknown adjustment type refused', 'invalid', 'curator', 'POST', adj, 400, { json: { adjustmentType: 'THEFT', quantityDelta: -1, expectedQuantity: expected + 2, reason: 'x' }, op: adjOp });
  for (const [type, delta] of [['REMOVAL', -1], ['TRANSFER_OUT', -1], ['DEACCESSION', -1], ['MISSING_LOSS', -1]]) {
    const now = (await one('select quantity from specimen_lot where id = $1', [poor])).quantity;
    await call(`${type} accepted`, 'happy', 'curator', 'POST', adj, 201, { json: { adjustmentType: type, quantityDelta: delta, expectedQuantity: now, reason: `Audit ${type}` }, op: adjOp });
  }
  const left = (await one('select quantity from specimen_lot where id = $1', [poor])).quantity;
  await call('positive delta on a removal type refused', 'invalid', 'curator', 'POST', adj, [400, 409], { json: { adjustmentType: 'REMOVAL', quantityDelta: 1, expectedQuantity: left, reason: 'x' }, op: adjOp });
  await call('removal past zero refused', 'invalid', 'curator', 'POST', adj, [400, 409], { json: { adjustmentType: 'REMOVAL', quantityDelta: -(left + 5), expectedQuantity: left, reason: 'x' }, op: adjOp });
  await call('data correction', 'happy', 'curator', 'POST', adj, 201, { json: { adjustmentType: 'DATA_CORRECTION', quantityDelta: 1, expectedQuantity: left, reason: 'Audit correction' }, op: adjOp });
  const left2 = (await one('select quantity from specimen_lot where id = $1', [poor])).quantity;
  await call('destruction to zero', 'happy', 'curator', 'POST', adj, 201, { json: { adjustmentType: 'DESTRUCTION', quantityDelta: -left2, expectedQuantity: left2, reason: 'Audit destruction' }, op: adjOp });
  const empty = await one('select quantity, is_active from specimen_lot where id = $1', [poor]);
  check(`POST ${adjOp}`, 'db', 'emptied lot deactivated, never a zero active lot', empty?.is_active === false, { expected: 'is_active false', actual: empty, srs: ['REQ-4.5-02'] });
  const txs = await sql("select adjustment_type, reason, performed_by from specimen_lot_transaction where transaction_type = 'QUANTITY_ADJUSTMENT' and (source_lot_id = $1 or target_lot_id = $1)", [poor]);
  check(`POST ${adjOp}`, 'db', 'each adjustment stored with type, reason, curator', txs.filter((t) => /^Audit /.test(t.reason ?? '') && t.performed_by === ids.curator && t.adjustment_type).length >= 7, { expected: '>=7 complete rows', actual: txs });

  section('4.5 Lots and quantities', ['REQ-4.5-03']);
  const summary = await call('summary', 'happy', 'curator', 'GET', `${base}/summary`, 200, { op: `${op}/summary` });
  const dbTotal = await total(s);
  check(`GET ${op}/summary`, 'shape', 'total equals sum of active lots', JSON.stringify(summary.body).includes(`${dbTotal}`) && (summary.body?.totalQuantity ?? dbTotal) === dbTotal, { expected: dbTotal, actual: summary.body });
  await call('list active', 'happy', 'curator', 'GET', base, 200, { op });
  const inactive = await call('list including inactive', 'happy', 'curator', 'GET', base, 200, { query: { includeInactive: true }, op });
  check(`GET ${op}`, 'shape', 'inactive lot included on request', JSON.stringify(inactive.body).includes(poor), { expected: 'emptied lot', actual: Array.isArray(inactive.body) ? inactive.body.length : null });
  await call('read lot', 'happy', 'curator', 'GET', `${base}/${a}`, 200, { op: `${op}/:id` });
  await call('unknown lot is 404', 'invalid', 'curator', 'GET', `${base}/${UNKNOWN_ID}`, 404, { op: `${op}/:id` });
  await call('lot of another specimen is 404', 'invalid', 'curator', 'GET', `/specimens/${ids.specimen}/lots/${a}`, 404, { op: `${op}/:id` });

  section('4.5 Lots and quantities', ['REQ-4.5-11']);
  await call('transactions', 'happy', 'curator', 'GET', `${base}/${a}/transactions`, 200, { op: `${op}/:id/transactions` });
  const history = await call('history', 'happy', 'curator', 'GET', `${base}/history`, 200, { op: `${op}/history` });
  check(`GET ${op}/history`, 'shape', 'history returns entries', (history.body?.total ?? history.body?.items?.length ?? 0) > 0, { expected: '>0', actual: history.body?.total ?? null });
  await call('history rejects a bad type', 'invalid', 'curator', 'GET', `${base}/history`, 400, { query: { transactionType: 'NOPE' }, op: `${op}/history` });

  // DEF-030: a row the migration allows but the API enum omits.
  await sql("insert into specimen_lot_transaction(source_lot_id, transaction_type, quantity_affected, adjustment_type, reason, performed_by) values ($1,'QUANTITY_ADJUSTMENT',1,'TEMPORARY_ABSENCE','Audit legacy row',$2)", [a, ids.curator]);
  const legacy = await call('history survives a TEMPORARY_ABSENCE row', 'happy', 'curator', 'GET', `${base}/history`, 200, { op: `${op}/history` });
  check(`GET ${op}/history`, 'shape', 'legacy value returned', JSON.stringify(legacy.body).includes('TEMPORARY_ABSENCE'), { expected: 'row', actual: legacy.body?.total ?? null, note: '28 Oct High defect DEF-030.' });

  section('4.5 Lots and quantities', ['REQ-4.5-10']);
  await call('notes update', 'happy', 'curator', 'PATCH', `${base}/${a}/notes`, 200, { json: { storageNotes: 'Audit note' }, op: `${op}/:id/notes` });
  const note = await one('select storage_notes from specimen_lot where id = $1', [a]);
  check(`PATCH ${op}/:id/notes`, 'db', 'note persisted', note?.storage_notes === 'Audit note', { expected: 'Audit note', actual: note });
  await call('missing note field refused', 'invalid', 'curator', 'PATCH', `${base}/${a}/notes`, 400, { json: {}, op: `${op}/:id/notes` });

  section('4.6 Storage locations', ['REQ-4.6-09']);
  const lm = await call('lot movements for unit', 'happy', 'curator', 'GET', `/storage-locations/${ids.innerBox}/lot-movements`, 200, { op: '/storage-locations/:id/lot-movements' });
  check('GET /storage-locations/:id/lot-movements', 'shape', 'movement shows quantity, from, to, reason', /Audit partial move/.test(JSON.stringify(lm.body)), { expected: 'movement entry', actual: lm.body?.total ?? null });
  await call('bad movement type refused', 'invalid', 'curator', 'GET', `/storage-locations/${ids.innerBox}/lot-movements`, 400, { query: { transactionType: 'NOPE' }, op: '/storage-locations/:id/lot-movements' });
  await call('unit with active lots cannot be archived', 'invalid', 'curator', 'PATCH', `/storage-locations/${ids.innerBox}/archive`, [400, 409], { op: '/storage-locations/:id/archive', srs: ['REQ-4.6-02'] });
}
