/** Public CLI + real PostgreSQL/file readback; no dotenv or shared services. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { randomUUID, randomBytes } = require('node:crypto');
const REPO = path.resolve(__dirname, '..');
const IMAGE =
  'postgres@sha256:eee6c6e1b0894fa4fe0075eb054af9fd1cf39a35321c2d4110626cfe506411fb';
const HOST =
  process.platform === 'win32'
    ? 'npipe:////./pipe/dockerDesktopLinuxEngine'
    : 'unix:///var/run/docker.sock';
const enabled = process.env.RUN_RECOVERY_REHEARSAL === 'true';
const env = Object.fromEntries(
  Object.entries(process.env).filter(([k]) =>
    [
      'path',
      'systemroot',
      'windir',
      'comspec',
      'pathext',
      'temp',
      'tmp',
      'userprofile',
      'localappdata',
      'appdata',
      'programfiles',
      'programdata',
    ].includes(k.toLowerCase()),
  ),
);
let root, owner, profile, source, target, checkpoint;
const containers = [];
function docker(args, input) {
  return execFileSync('docker', ['--host', HOST, ...args], {
    env,
    input,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}
function sql(id, query) {
  return docker(
    [
      'exec',
      '-i',
      id,
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'biosphere_recovery_fixture',
    ],
    query,
  ).trim();
}
function run(operation, snapshot) {
  const args = [
    path.join(REPO, 'scripts/recovery/cli.cjs'),
    operation,
    '--profile',
    path.join(root, 'profile.json'),
  ];
  if (snapshot) args.push('--snapshot', snapshot);
  const r = spawnSync(process.execPath, args, {
    env,
    encoding: 'utf8',
    timeout: 120000,
    windowsHide: true,
  });
  let result = null;
  try {
    result = JSON.parse(r.stdout || 'null');
  } catch {
    // Preserve missing/invalid CLI output for the public assertion's diagnostic.
  }
  return { code: r.status, output: r.stdout, stderr: r.stderr, result };
}
before(async () => {
  if (!enabled) return;
  owner = randomUUID();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'biosphere-recovery-'));
  fs.writeFileSync(path.join(root, '.recovery-owner'), owner, { mode: 0o600 });
  fs.writeFileSync(path.join(root, 'recovery.key'), randomBytes(32), {
    mode: 0o600,
  });
  fs.writeFileSync(
    path.join(root, 'configuration.json'),
    JSON.stringify({
      mode: 'synthetic',
      backendSource: '0'.repeat(40),
      frontendSource: '1'.repeat(40),
      outboundMail: false,
    }),
  );
  for (const bucket of [
    'specimen-media',
    'exhibit-media',
    'ar-assets',
    'user-avatars',
    'inquiry-attachments',
  ])
    fs.mkdirSync(path.join(root, 'objects', bucket), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'objects', 'specimen-media', 'synthetic-image.bin'),
    Buffer.from([0, 255, 1, 2, 10]),
  );
  fs.writeFileSync(
    path.join(root, 'objects', 'ar-assets', 'synthetic-model.glb'),
    'SYNTHETIC MODEL ONLY',
  );
  // ASCII filesystem ordering deliberately differs from English SQL collation.
  fs.writeFileSync(
    path.join(root, 'objects', 'specimen-media', 'Z.bin'),
    'UPPERCASE FIXTURE',
  );
  fs.writeFileSync(
    path.join(root, 'objects', 'specimen-media', 'a.bin'),
    'lowercase fixture',
  );
  for (let i = 0; i < 2; i++) {
    const id = docker([
      'create',
      '--pull=never',
      '--network',
      'none',
      '--label',
      `biosphere.recovery.owner=${owner}`,
      '--memory',
      '512m',
      '--log-driver',
      'none',
      '--tmpfs',
      '/var/lib/postgresql/data:rw,nosuid,noexec,size=268435456',
      '-e',
      'POSTGRES_HOST_AUTH_METHOD=trust',
      '-e',
      'POSTGRES_DB=biosphere_recovery_fixture',
      IMAGE,
    ]).trim();
    assert.match(id, /^[a-f0-9]{64}$/);
    containers.push(id);
    docker(['start', id]);
    let ready = false;
    for (let n = 0; n < 80; n++) {
      try {
        sql(id, 'SELECT 1');
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    assert.ok(ready, 'owned PostgreSQL must become ready');
    sql(
      id,
      'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;',
    );
  }
  [source, target] = containers;
  // Actual public migrations, with deliberately synthetic Auth and Storage stand-ins.
  sql(
    source,
    `CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, encrypted_password text);
    CREATE TABLE auth.identities(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),provider text);
    CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean NOT NULL);
    CREATE TABLE storage.objects(bucket_id text REFERENCES storage.buckets(id),name text COLLATE "en-US-x-icu",PRIMARY KEY(bucket_id,name));
    CREATE TABLE public._prisma_migrations(id varchar(36) PRIMARY KEY,checksum varchar(64) NOT NULL,finished_at timestamptz,migration_name varchar(255) NOT NULL,logs text,rolled_back_at timestamptz,started_at timestamptz NOT NULL DEFAULT now(),applied_steps_count integer NOT NULL DEFAULT 0);`,
  );
  const { createHash } = require('node:crypto');
  for (const name of fs
    .readdirSync(path.join(REPO, 'prisma/migrations'))
    .sort()) {
    const file = path.join(REPO, 'prisma/migrations', name, 'migration.sql');
    if (!fs.existsSync(file)) continue;
    const bytes = fs.readFileSync(file);
    sql(source, bytes);
    sql(
      source,
      `INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,applied_steps_count) VALUES ('${randomUUID()}','${createHash('sha256').update(bytes).digest('hex')}',now(),'${name}',1);`,
    );
  }
  sql(
    source,
    `INSERT INTO auth.users VALUES ('11111111-1111-4111-8111-111111111111','fixture@example.invalid','SYNTHETIC HASH');
    INSERT INTO auth.identities VALUES ('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','synthetic');
    INSERT INTO user_account(id,auth_user_id,full_name,role,status) VALUES ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Synthetic recovery operator','CURATOR','ACTIVE');
    INSERT INTO collection(id,collection_name) VALUES ('44444444-4444-4444-8444-444444444444','SYNTHETIC RECOVERY COLLECTION');
    INSERT INTO specimen(id,collection_id,common_name,status,created_by) VALUES ('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444','SYNTHETIC RECOVERY SPECIMEN','UNCATALOGED','33333333-3333-4333-8333-333333333333');
    INSERT INTO storage_unit(id,unit_type,label,storage_type,holds_specimens) VALUES ('66666666-6666-4666-8666-666666666666','DRAWER','SYNTHETIC DRAWER','DRY',true);
    INSERT INTO specimen_lot(id,specimen_id,storage_unit_id,condition_class,quantity,created_by) VALUES ('77777777-7777-4777-8777-777777777777','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666','GOOD',7,'33333333-3333-4333-8333-333333333333');
    INSERT INTO offline_draft_sync(id,created_by,client_draft_id,specimen_id,payload_fingerprint) VALUES ('88888888-8888-4888-8888-888888888888','33333333-3333-4333-8333-333333333333','99999999-9999-4999-8999-999999999999','55555555-5555-4555-8555-555555555555','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    INSERT INTO audit_log(user_id,affected_record_id,affected_record_type,action,module,status) VALUES ('33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555','specimen','SYNTHETIC_CREATE','cataloging','SUCCESS');
    INSERT INTO storage.buckets VALUES ('specimen-media',false),('exhibit-media',false),('ar-assets',false),('user-avatars',false),('inquiry-attachments',false);
    INSERT INTO storage.objects VALUES ('specimen-media','synthetic-image.bin'),('ar-assets','synthetic-model.glb'),('specimen-media','Z.bin'),('specimen-media','a.bin');`,
  );
  assert.equal(
    sql(
      source,
      "SELECT string_agg(name,',' ORDER BY name) FROM storage.objects WHERE name IN ('Z.bin','a.bin')",
    ),
    'a.bin,Z.bin',
  );
  profile = {
    format: 'biosphere-synthetic-recovery-v1',
    owner,
    sourceContainer: source,
    targetContainer: target,
    image: IMAGE,
    operator: 'synthetic-rehearsal',
  };
  fs.writeFileSync(path.join(root, 'profile.json'), JSON.stringify(profile));
});
after(() => {
  if (!enabled) return;
  for (const id of containers) {
    const info = JSON.parse(docker(['inspect', id]))[0];
    if (
      info.Id !== id ||
      info.Config.Labels['biosphere.recovery.owner'] !== owner
    )
      throw Error('Cleanup ownership mismatch');
    if (info.State.Paused) docker(['unpause', id]);
    docker(['rm', '-f', '-v', id]);
  }
  // Retain synthetic inputs, test key, encrypted checkpoint, restored files and
  // ledger for local inspection; none of this private workspace is uploaded.
  if (root)
    console.log(
      JSON.stringify({
        fixtureRunId: owner,
        evidenceDirectoryName: path.basename(root),
        scope: 'synthetic-only',
      }),
    );
});
test(
  'capture and restore a complete synthetic checkpoint through the manual CLI',
  { skip: !enabled },
  async (t) => {
    const captured = run('capture');
    assert.equal(captured.code, 0, captured.output + captured.stderr);
    assert.equal(captured.result.status, 'CAPTURED');
    checkpoint = captured.result.snapshotId;
    await t.test(
      'a retained restore workspace gets an explicit retry refusal',
      () => {
        const dir = path.join(root, 'restores', checkpoint);
        fs.mkdirSync(dir, { recursive: true });
        const marker = path.join(dir, 'partial.txt');
        fs.writeFileSync(marker, 'KEEP PARTIAL EVIDENCE');
        try {
          const r = run('restore', checkpoint);
          assert.equal(r.code, 1);
          assert.equal(r.result.code, 'RESTORE_WORKSPACE_EXISTS');
          assert.equal(
            fs.readFileSync(marker, 'utf8'),
            'KEEP PARTIAL EVIDENCE',
          );
          assert.equal(
            sql(
              target,
              "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
            ),
            '0',
          );
        } finally {
          fs.unlinkSync(marker);
          fs.rmdirSync(dir);
        }
      },
    );
    assert.equal(
      fs
        .readFileSync(path.join(root, 'checkpoints', checkpoint + '.bsp'))
        .includes(Buffer.from('SYNTHETIC RECOVERY SPECIMEN')),
      false,
    );
    // Pausing makes the source unavailable without wiping its temporary seed.
    docker(['pause', source]);
    assert.equal(JSON.parse(docker(['inspect', source]))[0].State.Paused, true);
    const restored = run('restore', captured.result.snapshotId);
    assert.equal(restored.code, 0, restored.output + restored.stderr);
    assert.equal(restored.result.status, 'RESTORED_VERIFIED');
    assert.equal(
      sql(
        target,
        "SELECT common_name FROM specimen WHERE id='55555555-5555-4555-8555-555555555555'",
      ),
      'SYNTHETIC RECOVERY SPECIMEN',
    );
    assert.equal(
      sql(
        target,
        'SELECT count(*) FROM user_account u JOIN auth.users a ON a.id=u.auth_user_id JOIN auth.identities i ON i.user_id=a.id',
      ),
      '1',
    );
    assert.equal(
      sql(
        target,
        "SELECT count(*) FROM audit_log WHERE action='SYNTHETIC_CREATE'",
      ),
      '1',
    );
    assert.equal(
      sql(
        target,
        "SELECT count(*) FROM pg_enum WHERE enumlabel='TEMPORARY_ABSENCE'",
      ),
      '1',
    );
    assert.equal(sql(target, 'SELECT quantity FROM specimen_lot'), '7');
    assert.equal(
      sql(target, 'SELECT client_draft_id::text FROM offline_draft_sync'),
      '99999999-9999-4999-8999-999999999999',
    );
    assert.deepEqual(
      fs.readFileSync(
        path.join(
          root,
          'restores',
          captured.result.snapshotId,
          'objects',
          'specimen-media',
          'synthetic-image.bin',
        ),
      ),
      Buffer.from([0, 255, 1, 2, 10]),
    );
    assert.equal(
      fs.readdirSync(
        path.join(
          root,
          'restores',
          captured.result.snapshotId,
          'objects',
          'inquiry-attachments',
        ),
      ).length,
      0,
    );
    assert.equal(
      JSON.parse(
        fs.readFileSync(
          path.join(
            root,
            'restores',
            captured.result.snapshotId,
            'configuration.json',
          ),
        ),
      ).outboundMail,
      false,
    );
    assert.equal(
      run('verify', captured.result.snapshotId).result.status,
      'VERIFIED',
    );
    docker(['unpause', source]);
  },
);

test(
  'corrupt encrypted bytes are rejected without changing restored data',
  { skip: !enabled },
  () => {
    assert.ok(checkpoint);
    const file = path.join(root, 'checkpoints', checkpoint + '.bsp'),
      good = fs.readFileSync(file);
    const corrupt = Buffer.from(good);
    corrupt[corrupt.length - 1] ^= 1;
    fs.writeFileSync(file, corrupt);
    try {
      const r = run('restore', checkpoint);
      assert.equal(r.code, 1);
      assert.equal(r.result.code, 'AUTHENTICATION_FAILED');
      assert.equal(sql(target, 'SELECT count(*) FROM specimen'), '1');
      const events = fs
        .readFileSync(path.join(root, 'recovery-events.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse);
      assert.equal(events.at(-1).status, 'FAILED');
      assert.equal(events.at(-1).code, 'AUTHENTICATION_FAILED');
    } finally {
      fs.writeFileSync(file, good);
    }
  },
);

test(
  'a populated owned target is rejected rather than overwritten',
  { skip: !enabled },
  () => {
    const r = run('restore', checkpoint);
    assert.equal(r.code, 1);
    assert.equal(r.result.code, 'TARGET_NOT_EMPTY');
    assert.equal(sql(target, 'SELECT count(*) FROM specimen'), '1');
  },
);

test(
  'a wrong key cannot authenticate the checkpoint',
  { skip: !enabled },
  () => {
    const file = path.join(root, 'recovery.key'),
      good = fs.readFileSync(file);
    fs.writeFileSync(file, randomBytes(32));
    try {
      const r = run('restore', checkpoint);
      assert.equal(r.code, 1);
      assert.equal(r.result.code, 'AUTHENTICATION_FAILED');
      assert.equal(sql(target, 'SELECT count(*) FROM specimen'), '1');
    } finally {
      fs.writeFileSync(file, good);
    }
  },
);

test(
  'a source/target identity collision is rejected before any SQL write',
  { skip: !enabled },
  () => {
    fs.writeFileSync(
      path.join(root, 'profile.json'),
      JSON.stringify({ ...profile, targetContainer: source }),
    );
    try {
      const r = run('restore', checkpoint);
      assert.equal(r.code, 1);
      assert.equal(r.result.code, 'INVALID_TARGET');
      assert.equal(sql(target, 'SELECT count(*) FROM specimen'), '1');
    } finally {
      fs.writeFileSync(
        path.join(root, 'profile.json'),
        JSON.stringify(profile),
      );
    }
  },
);

test(
  'a lock held by another attempt is never removed or bypassed',
  { skip: !enabled },
  () => {
    const lock = path.join(root, '.recovery-lock');
    fs.writeFileSync(lock, 'another-attempt', { flag: 'wx' });
    try {
      const r = run('verify', checkpoint);
      assert.equal(r.code, 1);
      assert.equal(r.result.code, 'RUN_LOCKED');
      assert.equal(fs.readFileSync(lock, 'utf8'), 'another-attempt');
    } finally {
      fs.unlinkSync(lock);
    }
  },
);

test(
  'changed restored file bytes fail verification',
  { skip: !enabled },
  () => {
    const file = path.join(
        root,
        'restores',
        checkpoint,
        'objects',
        'specimen-media',
        'synthetic-image.bin',
      ),
      good = fs.readFileSync(file);
    fs.writeFileSync(file, 'DAMAGED');
    try {
      const r = run('verify', checkpoint);
      assert.equal(r.code, 1);
      assert.equal(r.result.code, 'OBJECT_VERIFICATION_FAILED');
    } finally {
      fs.writeFileSync(file, good);
    }
  },
);

test('changed restored rows fail verification', { skip: !enabled }, () => {
  sql(target, "UPDATE specimen SET common_name='CHANGED SYNTHETIC VALUE'");
  try {
    const r = run('verify', checkpoint);
    assert.equal(r.code, 1);
    assert.equal(r.result.code, 'TABLE_VERIFICATION_FAILED');
  } finally {
    sql(
      target,
      "UPDATE specimen SET common_name='SYNTHETIC RECOVERY SPECIMEN'",
    );
  }
});

test(
  'export-tool failure cannot replace the last checkpoint or report capture success',
  { skip: !enabled },
  async () => {
    const prior = fs.readFileSync(
      path.join(root, 'checkpoints', checkpoint + '.bsp'),
    );
    docker(['start', source]);
    let ready = false;
    for (let n = 0; n < 80; n++) {
      try {
        sql(source, 'SELECT 1');
        ready = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    assert.ok(ready);
    docker(['exec', source, 'chmod', '000', '/usr/local/bin/pg_dump']);
    try {
      const r = run('capture');
      assert.equal(r.code, 1);
      assert.equal(r.result.code, 'DOCKER_OPERATION_FAILED');
      assert.deepEqual(
        fs.readFileSync(path.join(root, 'checkpoints', checkpoint + '.bsp')),
        prior,
      );
      assert.equal(fs.readdirSync(path.join(root, 'checkpoints')).length, 1);
      const events = fs
        .readFileSync(path.join(root, 'recovery-events.jsonl'), 'utf8')
        .trim()
        .split('\n')
        .map(JSON.parse);
      assert.equal(events.at(-1).status, 'FAILED');
    } finally {
      docker(['exec', source, 'chmod', '755', '/usr/local/bin/pg_dump']);
    }
  },
);

test(
  'missing source object bytes are not silently omitted',
  { skip: !enabled },
  () => {
    const file = path.join(
        root,
        'objects',
        'specimen-media',
        'synthetic-image.bin',
      ),
      good = fs.readFileSync(file);
    fs.unlinkSync(file);
    try {
      const r = run('capture');
      assert.equal(r.code, 1);
      assert.equal(r.result.code, 'OBJECT_REFERENCE_MISMATCH');
      assert.equal(fs.readdirSync(path.join(root, 'checkpoints')).length, 1);
    } finally {
      fs.writeFileSync(file, good);
    }
  },
);

test(
  'a target with a different ownership label is refused',
  { skip: !enabled },
  () => {
    const wrongOwner = randomUUID();
    fs.writeFileSync(
      path.join(root, 'profile.json'),
      JSON.stringify({ ...profile, owner: wrongOwner }),
    );
    fs.writeFileSync(path.join(root, '.recovery-owner'), wrongOwner);
    try {
      const r = run('verify', checkpoint);
      assert.equal(r.code, 1);
      assert.equal(r.result.code, 'CONTAINER_NOT_OWNED');
      assert.equal(sql(target, 'SELECT count(*) FROM specimen'), '1');
    } finally {
      fs.writeFileSync(
        path.join(root, 'profile.json'),
        JSON.stringify(profile),
      );
      fs.writeFileSync(path.join(root, '.recovery-owner'), owner);
    }
  },
);

test(
  'non-table target objects are also protected from restore',
  { skip: !enabled },
  () => {
    // Only this test-owned isolated target is emptied; never an environment URL.
    sql(
      target,
      'DROP SCHEMA public,auth,storage CASCADE; CREATE SCHEMA public; CREATE FUNCTION public.keep_me() RETURNS integer LANGUAGE sql AS $$ SELECT 7 $$;',
    );
    const r = run('restore', checkpoint);
    assert.equal(r.code, 1);
    assert.equal(r.result.code, 'TARGET_NOT_EMPTY');
    assert.equal(sql(target, 'SELECT public.keep_me()'), '7');
    assert.equal(
      sql(
        target,
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
      ),
      '0',
    );
  },
);

test('hosted connection flags are refused by the public CLI', () => {
  const r = spawnSync(
    process.execPath,
    [
      path.join(REPO, 'scripts/recovery/cli.cjs'),
      'capture',
      '--database-url',
      'postgresql://synthetic.invalid/db',
    ],
    { env, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).code, 'INVALID_ARGUMENTS');
  assert.equal(r.stderr, '');
});

test('snapshot path traversal is rejected before a profile or Docker is opened', () => {
  const r = spawnSync(
    process.execPath,
    [
      path.join(REPO, 'scripts/recovery/cli.cjs'),
      'restore',
      '--profile',
      'does-not-exist.json',
      '--snapshot',
      '../outside',
    ],
    { env, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(r.status, 1);
  assert.equal(JSON.parse(r.stdout).code, 'INVALID_ARGUMENTS');
  assert.equal(r.stderr, '');
});

test('help identifies the synthetic-only execution boundary without Docker', () => {
  const r = spawnSync(
    process.execPath,
    [path.join(REPO, 'scripts/recovery/cli.cjs'), 'help'],
    { env, encoding: 'utf8', windowsHide: true },
  );
  assert.equal(r.status, 0);
  assert.match(JSON.parse(r.stdout).scope, /synthetic/);
  assert.equal(r.stderr, '');
});
