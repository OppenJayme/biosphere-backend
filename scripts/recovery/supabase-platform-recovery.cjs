'use strict';
// Restricted same-version fixture recovery, not a hosted/production restore API.
const {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} = require('node:crypto');
const {
  requireAnonymousObjectHidden,
  containsFixtureObjectFile,
} = require('./supabase-storage-contract.cjs');
const POLICY_SQL = `CREATE POLICY lab_owner_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'synthetic-private' AND owner_id = (SELECT auth.jwt()->>'sub'));
  CREATE POLICY lab_owner_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'synthetic-private' AND owner_id = (SELECT auth.jwt()->>'sub'));`;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
// Fresh-target account recovery intentionally excludes active/transient login state.
const REAUTH_TABLES = [
  'sessions',
  'refresh_tokens',
  'mfa_amr_claims',
  'mfa_challenges',
  'flow_state',
  'one_time_tokens',
  'saml_relay_states',
  'oauth_authorizations',
  'oauth_client_states',
];
function inventory(sql, full = false) {
  return sql(`BEGIN;
    CREATE TEMP TABLE lab_counts (name text, rows bigint) ON COMMIT DROP;
    DO $$ DECLARE t record; BEGIN
      FOR t IN SELECT schemaname, tablename FROM pg_tables
        WHERE schemaname IN ('auth','storage'${full ? ",'public'" : ''}) AND tablename NOT IN ('schema_migrations','migrations')
        ORDER BY schemaname COLLATE "C", tablename COLLATE "C"
      LOOP EXECUTE format('INSERT INTO lab_counts SELECT %L, count(*) FROM %I.%I',
        t.schemaname || '.' || t.tablename, t.schemaname, t.tablename); END LOOP;
    END $$;
    SELECT json_object_agg(name, rows ORDER BY name COLLATE "C") FROM lab_counts;
    COMMIT;`);
}
function helpers(ctx) {
  const { docker, inspect, validate, check, fullProfile } = ctx;
  const schema = (service) =>
    hash(
      docker([
        'exec',
        service.db,
        'pg_dump',
        '-U',
        'supabase_admin',
        '-d',
        'postgres',
        '--schema=auth',
        '--schema=storage',
        ...(fullProfile ? ['--schema=public'] : []),
        '--schema-only',
        '--no-owner',
        ...(!fullProfile ? ['--no-privileges'] : []),
      ]).replace(/^\\(?:un)?restrict .*\r?$/gm, ''),
    );
  const apps = (service) => [service.auth, service.rest, service.storage];
  const pause = (service) => {
    for (const id of apps(service)) {
      validate(id, true);
      if (id === service.storage) {
        docker(['kill', '--signal', 'STOP', id]);
        check(
          /^State:\s+T/m.test(docker(['exec', id, 'cat', '/proc/1/status'])),
          'STORAGE_PROCESS_NOT_FROZEN',
        );
      } else docker(['pause', id]);
    }
  };
  const resume = (service) => {
    for (const id of apps(service)) {
      if (id === service.storage) {
        check(
          /^State:\s+T/m.test(docker(['exec', id, 'cat', '/proc/1/status'])),
          'STORAGE_PROCESS_NOT_FROZEN',
        );
        docker(['kill', '--signal', 'CONT', id]);
      } else {
        check(inspect(id).State.Paused, 'EXPECTED_PAUSED_SERVICE');
        docker(['unpause', id]);
      }
      validate(id, true);
    }
  };
  return { schema, pause, resume };
}
function capturePlatform(ctx) {
  const { source, docker, validate, check, images, setPhase, fullProfile } =
    ctx;
  const { schema, pause } = helpers(ctx);
  setPhase('platform-capture');
  for (const id of source.ids) validate(id, true);
  pause(source);
  const before = inventory(source.sql, fullProfile);
  const sourceSchema = schema(source);
  const dump = docker(
    [
      'exec',
      source.db,
      'pg_dump',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
      '--format=custom',
      '--data-only',
      '--schema=auth',
      '--schema=storage',
      ...(fullProfile
        ? ['--schema=public', '--exclude-table=public._prisma_migrations']
        : []),
      '--exclude-table=auth.schema_migrations',
      '--exclude-table=storage.migrations',
      ...REAUTH_TABLES.map((table) => `--exclude-table=auth.${table}`),
      '--no-owner',
      '--no-privileges',
    ],
    undefined,
    true,
  );
  check(dump.subarray(0, 5).toString() === 'PGDMP', 'INVALID_DATABASE_CAPTURE');
  // Docker cp observed an empty view of this tmpfs. Read in the actual mount
  // namespace while the server's PID 1 is stopped; auxiliary exec still works.
  const objects = docker(
    ['exec', source.storage, 'tar', '-C', '/var/lib/storage', '-cf', '-', '.'],
    undefined,
    true,
  );
  const objectPaths = docker(
    ['exec', '-i', source.db, 'tar', '-tf', '-'],
    objects,
  );
  check(
    containsFixtureObjectFile(objectPaths),
    'OBJECT_ARCHIVE_MISSING_EXPECTED_FILE',
  );
  check(
    dump.length < 16 * 1024 ** 2 && objects.length < 16 * 1024 ** 2,
    'FIXTURE_CAPTURE_TOO_LARGE',
  );
  check(
    inventory(source.sql, fullProfile) === before &&
      schema(source) === sourceSchema,
    'SOURCE_CHANGED_DURING_CAPTURE',
  );
  const expectedRows = JSON.parse(before);
  for (const table of REAUTH_TABLES) {
    const name = `auth.${table}`;
    if (Object.hasOwn(expectedRows, name)) expectedRows[name] = 0;
  }
  return {
    format: fullProfile
      ? 'biosphere-platform-fixture-v3'
      : 'biosphere-platform-fixture-v2',
    ...(fullProfile
      ? {
          application: {
            ...source.application,
            publicDataHash: ctx.publicDataHash(source.sql),
          },
        }
      : {}),
    images,
    schema: sourceSchema,
    baseline: source.baseline,
    rows: JSON.stringify(expectedRows),
    dump: dump.toString('base64'),
    objects: objects.toString('base64'),
  };
}
async function stopCapturedSource(ctx) {
  const { inside, source, docker, inspect, validate, check, setPhase } = ctx;
  const { resume } = helpers(ctx);
  setPhase('source-unavailable');
  resume(source);
  for (const id of [...source.ids].reverse()) {
    validate(id, true);
    docker(['stop', '--time', '1', id]);
    docker(['network', 'disconnect', '--force', inside, id]);
    const stopped = inspect(id);
    check(
      !stopped.State.Running &&
        Object.keys(stopped.NetworkSettings.Networks).length === 0,
      'SOURCE_STILL_AVAILABLE',
    );
  }
  let sourceReachable = false;
  try {
    await source.serviceRequest(`${source.authUrl}/health`);
    sourceReachable = true;
  } catch {
    /* expected disconnected source */
  }
  check(!sourceReachable, 'SOURCE_API_STILL_AVAILABLE');
}
async function restorePlatform(ctx, packet, fixture) {
  const { inside, docker, check, platform, images, setPhase, fullProfile } =
    ctx;
  const { schema, pause, resume } = helpers(ctx);
  const { assertSourceUnavailable, sourceState } = ctx;
  validateCapturedPacket(packet, images, check, fullProfile);
  check(
    typeof assertSourceUnavailable === 'function',
    'SOURCE_VERIFICATION_REQUIRED',
  );
  assertSourceUnavailable();
  setPhase('target-initialize');
  const target = await platform(inside, 'target-');
  check(
    hash(target.secret) !== fixture.sourceSigningKeyHash &&
      !Object.hasOwn(packet, 'secret'),
    'TARGET_SECRET_NOT_ROTATED',
  );
  pause(target);
  setPhase('target-preflight');
  check(
    inventory(target.sql, fullProfile) === packet.baseline,
    'TARGET_HAS_UNEXPECTED_DATA',
  );
  if (fullProfile)
    check(
      target.application.migrationsHash === packet.application.migrationsHash &&
        target.application.bucketRulesHash ===
          packet.application.bucketRulesHash &&
        target.application.applicationBuildHash ===
          packet.application.applicationBuildHash &&
        target.application.settingsHash === packet.application.settingsHash,
      'APPLICATION_CONFIGURATION_MISMATCH',
    );
  target.sql(ctx.profilePolicy || POLICY_SQL);
  check(schema(target) === packet.schema, 'TARGET_SCHEMA_MISMATCH');
  check(
    target.sql('SHOW session_replication_role') === 'origin',
    'FOREIGN_KEYS_NOT_ENFORCED',
  );
  // This must reject an orphan through the real database constraint, then roll back.
  target.sql(`BEGIN; DO $$ BEGIN BEGIN
    INSERT INTO storage.objects (bucket_id,name) VALUES ('lab-no-such-bucket','orphan-probe.txt');
    RAISE EXCEPTION 'Foreign key enforcement missing';
    EXCEPTION WHEN foreign_key_violation THEN NULL; END; END $$; ROLLBACK;`);
  setPhase('platform-restore');
  docker(
    [
      'exec',
      '-i',
      target.db,
      'pg_restore',
      '-U',
      'supabase_admin',
      '-d',
      'postgres',
      '--data-only',
      '--single-transaction',
      '--exit-on-error',
      '--no-owner',
      '--no-privileges',
    ],
    Buffer.from(packet.dump, 'base64'),
  );
  docker(
    ['exec', '-i', target.storage, 'tar', '-C', '/var/lib/storage', '-xf', '-'],
    Buffer.from(packet.objects, 'base64'),
  );
  check(
    JSON.stringify(JSON.parse(inventory(target.sql, fullProfile))) ===
      packet.rows && schema(target) === packet.schema,
    'RESTORED_INVENTORY_MISMATCH',
  );
  if (fullProfile)
    check(
      ctx.publicDataHash(target.sql) === packet.application.publicDataHash,
      'RESTORED_PUBLIC_CONTENT_CHANGED',
    );
  resume(target);
  setPhase('restored-api-verification');
  const oldAccess = await target.serviceRequest(`${target.authUrl}/user`, {
    headers: { Authorization: `Bearer ${fixture.sourceAccessToken}` },
  });
  check([401, 403].includes(oldAccess.status), 'SOURCE_ACCESS_TOKEN_ACCEPTED');
  const oldRefresh = await target.serviceRequest(
    `${target.authUrl}/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: fixture.sourceRefreshToken }),
    },
  );
  check(
    oldRefresh.status === 400 &&
      (await oldRefresh.json()).error_code === 'refresh_token_not_found',
    'SOURCE_REFRESH_TOKEN_ACCEPTED',
  );
  const signIn = await target.serviceRequest(
    `${target.authUrl}/token?grant_type=password`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: fixture.email,
        password: fixture.userPassword,
      }),
    },
  );
  check(signIn.ok, 'RESTORED_PASSWORD_FAILED');
  const session = await signIn.json();
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const identity = await target.serviceRequest(`${target.authUrl}/user`, {
    headers,
  });
  check(
    identity.ok && (await identity.json()).id === fixture.userId,
    'RESTORED_IDENTITY_CHANGED',
  );
  const objectUrl = `${target.storageUrl}/object/authenticated/${fixture.bucket}/probe.txt`;
  const restored = await target.serviceRequest(objectUrl, { headers });
  check(
    restored.ok &&
      Buffer.from(await restored.arrayBuffer()).equals(fixture.bytes),
    'RESTORED_OBJECT_BYTES_CHANGED',
  );
  const denied = await target.serviceRequest(objectUrl, {
    headers: { Authorization: `Bearer ${target.anon}` },
  });
  const anonymousDenial = await requireAnonymousObjectHidden(denied);
  let application = {};
  if (fullProfile) {
    application = {
      buckets: await ctx.verifyBuckets(target, session.access_token, check),
      ...(await ctx.verifyApplication(target)),
      publicData: 'CONTENT_AND_RELATIONSHIPS_PRESERVED',
      migrations: 'APPLIED_AND_VERIFIED',
    };
  }
  assertSourceUnavailable();
  return {
    ...application,
    recovery: 'RESTORED_API_VERIFIED',
    source: sourceState,
    identity: 'PRESERVED',
    sourceAccess: 'REJECTED',
    sourceRefresh: 'REJECTED',
    foreignKeys: 'ENFORCED',
    privateBytes: 'PRESERVED',
    anonymous: 'DENIED',
    anonymousDenial,
  };
}
function validateCapturedPacket(packet, images, check, fullProfile = false) {
  check(
    packet?.format ===
      (fullProfile
        ? 'biosphere-platform-fixture-v3'
        : 'biosphere-platform-fixture-v2') &&
      Object.keys(packet).length === (fullProfile ? 8 : 7) &&
      JSON.stringify(packet.images) === JSON.stringify(images) &&
      typeof packet.schema === 'string' &&
      /^[a-f0-9]{64}$/.test(packet.schema) &&
      ['baseline', 'rows', 'dump', 'objects'].every(
        (key) => typeof packet[key] === 'string',
      ) &&
      !Object.hasOwn(packet, 'secret'),
    'PLATFORM_PACKET_INVALID',
  );
  if (fullProfile)
    check(
      packet.application?.profile === 'biosphere-full-v1' &&
        Object.keys(packet.application).length === 6 &&
        [
          'migrationsHash',
          'bucketRulesHash',
          'publicDataHash',
          'applicationBuildHash',
          'settingsHash',
        ].every(
          (k) =>
            typeof packet.application[k] === 'string' &&
            /^[a-f0-9]{64}$/.test(packet.application[k]),
        ),
      'APPLICATION_PACKET_INVALID',
    );
  for (const key of ['baseline', 'rows']) {
    let value;
    try {
      value = JSON.parse(packet[key]);
    } catch {
      check(false, 'PLATFORM_PACKET_INVALID');
    }
    check(
      value &&
        !Array.isArray(value) &&
        typeof value === 'object' &&
        Object.entries(value).every(
          ([name, count]) =>
            (fullProfile
              ? /^(auth|storage|public)\./
              : /^(auth|storage)\./
            ).test(name) &&
            Number.isSafeInteger(count) &&
            count >= 0,
        ),
      'PLATFORM_PACKET_INVALID',
    );
  }
  for (const key of ['dump', 'objects']) {
    const decoded = Buffer.from(packet[key], 'base64');
    check(
      decoded.length > 0 &&
        decoded.length < 16 * 1024 ** 2 &&
        decoded.toString('base64') === packet[key],
      'PLATFORM_PACKET_INVALID',
    );
  }
  check(
    Buffer.from(packet.dump, 'base64').subarray(0, 5).toString() === 'PGDMP',
    'INVALID_DATABASE_CAPTURE',
  );
}
async function recoverPlatform(ctx) {
  const { source, fixture, inspect, check, images } = ctx;
  const captured = capturePlatform(ctx);
  const body = Buffer.from(JSON.stringify(captured));
  const key = randomBytes(32),
    iv = randomBytes(12);
  try {
    const magic = Buffer.from('BSSLAB02');
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(magic);
    const encrypted = Buffer.concat([
      magic,
      iv,
      Buffer.alloc(16),
      cipher.update(body),
      cipher.final(),
    ]);
    cipher.getAuthTag().copy(encrypted, 20);
    const open = (packet) => {
      check(
        packet.length >= 36 && packet.subarray(0, 8).equals(magic),
        'INVALID_PLATFORM_PACKET',
      );
      const decipher = createDecipheriv(
        'aes-256-gcm',
        key,
        packet.subarray(8, 20),
      );
      decipher.setAAD(magic);
      decipher.setAuthTag(packet.subarray(20, 36));
      return JSON.parse(
        Buffer.concat([
          decipher.update(packet.subarray(36)),
          decipher.final(),
        ]).toString(),
      );
    };
    const corrupt = Buffer.from(encrypted);
    corrupt[corrupt.length - 1] ^= 1;
    let rejected = false;
    try {
      open(corrupt);
    } catch {
      rejected = true;
    }
    check(rejected, 'TAMPER_NOT_REJECTED');
    // Authentication happens before any target construction or write.
    const packet = open(encrypted);
    check(
      packet.format === 'biosphere-platform-fixture-v2' &&
        JSON.stringify(packet.images) === JSON.stringify(images),
      'PLATFORM_VERSION_MISMATCH',
    );
    await stopCapturedSource(ctx);
    const result = await restorePlatform(
      {
        ...ctx,
        sourceState: 'STOPPED_AND_DISCONNECTED',
        assertSourceUnavailable: () => {
          for (const id of source.ids)
            check(
              !inspect(id).State.Running &&
                Object.keys(inspect(id).NetworkSettings.Networks).length === 0,
              'SOURCE_RESTARTED',
            );
        },
      },
      packet,
      fixture,
    );
    return {
      ...result,
      integrity: 'TAMPER_REJECTED_BEFORE_RESTORE',
      checkpointSha256: hash(encrypted),
      checkpointBytes: encrypted.length,
    };
  } finally {
    key.fill(0);
  }
}
module.exports = {
  POLICY_SQL,
  inventory,
  recoverPlatform,
  capturePlatform,
  restorePlatform,
  validateCapturedPacket,
};
