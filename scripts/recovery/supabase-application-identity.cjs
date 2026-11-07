'use strict';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { images } = require('./supabase-lab-images.json');
const { program } = require('./supabase-lab-bridge.cjs');
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
function validateIdentity(identity) {
  assert.equal(Object.keys(identity ?? {}).length, 7);
  assert.match(identity.owner, UUID);
  for (const field of [
    'inside',
    'outside',
    'databaseId',
    'sqlGatewayId',
    'httpGatewayId',
    'marker',
  ])
    assert.match(identity[field], /^[a-f0-9]{64}$/);
  assert.equal(
    new Set([
      identity.databaseId,
      identity.sqlGatewayId,
      identity.httpGatewayId,
    ]).size,
    3,
  );
  assert.notEqual(identity.inside, identity.outside);
}
function inspect(kind, ids) {
  const socket =
    process.platform === 'win32'
      ? 'npipe:////./pipe/dockerDesktopLinuxEngine'
      : 'unix:///var/run/docker.sock';
  return JSON.parse(
    execFileSync('docker', ['--host', socket, kind, 'inspect', ...ids], {
      windowsHide: true,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }),
  );
}
function verifyContainerIdentity(identity, db, api) {
  validateIdentity(identity);
  const networks = inspect('network', [identity.inside, identity.outside]);
  for (let i = 0; i < 2; i++) {
    assert.equal(networks[i].Id, [identity.inside, identity.outside][i]);
    assert.equal(
      networks[i].Labels['biosphere.supabase-lab.owner'],
      identity.owner,
    );
    assert.equal(networks[i].Internal, i === 0);
  }
  const databaseImage = inspect('image', [images.database.image])[0].Id;
  const gatewayImage = inspect('image', [images.storage.image])[0].Id;
  const ids = [
    identity.databaseId,
    identity.sqlGatewayId,
    identity.httpGatewayId,
  ];
  const containers = inspect('container', ids);
  for (let i = 0; i < 3; i++) {
    const c = containers[i];
    assert.equal(c.Id, ids[i]);
    assert.equal(c.State.Running, true);
    assert.equal(
      c.Config.Labels['biosphere.supabase-lab.owner'],
      identity.owner,
    );
    assert.equal(c.Image, i === 0 ? databaseImage : gatewayImage);
    assert.equal(c.HostConfig.Privileged, false);
    assert.equal(c.HostConfig.Binds?.length ?? 0, 0);
    assert.ok(c.Mounts.every((m) => m.Type === 'tmpfs'));
    assert.equal(c.HostConfig.LogConfig.Type, 'none');
    assert.equal(c.HostConfig.MemorySwap, c.HostConfig.Memory);
    assert.equal(c.HostConfig.Memory, (i === 0 ? 768 : 128) * 1024 ** 2);
    const memberships = Object.values(c.NetworkSettings.Networks)
      .map((n) => n.NetworkID)
      .sort();
    assert.deepEqual(
      memberships,
      (i === 0
        ? [identity.inside]
        : [identity.inside, identity.outside]
      ).sort(),
    );
    if (i === 0)
      assert.equal(Object.keys(c.HostConfig.PortBindings ?? {}).length, 0);
    else {
      assert.deepEqual(c.Config.Entrypoint, ['node']);
      assert.deepEqual(c.Config.Cmd, [
        '-e',
        program(i === 1 ? 'sql' : 'http', 'target-'),
      ]);
      assert.equal(Object.keys(c.HostConfig.PortBindings).length, 1);
      const bindings = c.NetworkSettings.Ports['8080/tcp'];
      assert.equal(bindings.length, 1);
      assert.equal(bindings[0].HostIp, '127.0.0.1');
      assert.equal(bindings[0].HostPort, (i === 1 ? db : api).port);
    }
  }
}
async function verifyConnectedIdentity(prisma, identity) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT owner::text, container_id, marker FROM biosphere_recovery_lab.identity',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].owner, identity.owner);
  assert.equal(rows[0].container_id, identity.databaseId);
  assert.equal(rows[0].marker, identity.marker);
}
module.exports = {
  validateIdentity,
  verifyContainerIdentity,
  verifyConnectedIdentity,
};
