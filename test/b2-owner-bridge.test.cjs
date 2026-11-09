'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { Readable, Writable } = require('node:stream');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const sourceRoot = path.resolve(__dirname, '..');
const bridge = require('../scripts/recovery/b2-owner-transfer.cjs');

test('the owner bridge defaults to a plan with no live changes', async () => {
  const result = await bridge.runOwnerTransfer();
  assert.equal(result.code, 'B2_OWNER_TRANSFER_PLAN');
  assert.equal(result.liveChanges, false);
  assert.equal(result.deploymentAuthorized, false);
});

function copied(t) {
  const base = fs.realpathSync(os.tmpdir()),
    root = fs.mkdtempSync(path.join(base, 'biosphere-owner-bridge-'));
  fs.chmodSync(root, 0o700);
  fs.mkdirSync(path.join(root, 'scripts/recovery'), { recursive: true });
  for (const name of [
    'b2-owner-transfer.cjs',
    'b2-read-owner-packet.ps1',
    'b2-native-request.cjs',
    'b2-checkpoint-transfer.cjs',
    'supabase-checkpoint-store.cjs',
  ]) {
    const file = path.join(sourceRoot, 'scripts/recovery', name);
    if (fs.existsSync(file))
      fs.copyFileSync(file, path.join(root, 'scripts/recovery', name));
  }
  t.after(() => {
    const real = fs.realpathSync(root);
    assert.equal(path.dirname(real), base);
    assert.ok(path.basename(real).startsWith('biosphere-owner-bridge-'));
    fs.rmSync(real, { recursive: true, force: true });
  });
  return root;
}

test('the command-line preview emits only the public plan', (t) => {
  const root = copied(t),
    result = spawnSync(
      process.execPath,
      [path.join(root, 'scripts/recovery/b2-owner-transfer.cjs')],
      {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000,
        env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH },
      },
    );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).code, 'B2_OWNER_TRANSFER_PLAN');
});

const runId = '12345678-1234-4234-8234-123456789abc';
const WRITER = [
  'listBuckets',
  'readBucketRetentions',
  'readFileRetentions',
  'readFiles',
  'writeFiles',
  'writeFileRetentions',
];
function hostInfo() {
  const host = process.argv.includes('--powershell7')
    ? 'ps7'
    : 'windows-powershell';
  const home =
    host === 'ps7'
      ? path.join(process.env.ProgramFiles, 'PowerShell/7')
      : path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0');
  const exe = path.join(home, host === 'ps7' ? 'pwsh.exe' : 'powershell.exe');
  const env = {};
  for (const name of [
    'SystemRoot',
    'WINDIR',
    'SystemDrive',
    'ComSpec',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'ProgramFiles',
    'ProgramW6432',
  ])
    if (process.env[name]) env[name] = process.env[name];
  env.PATH =
    path.join(process.env.SystemRoot, 'System32') + path.delimiter + home;
  env.PSModulePath = path.join(home, 'Modules');
  env.PSModuleAnalysisCachePath = 'NUL';
  return { host, home, exe, env };
}
function fixture(t, scenario = 'success') {
  const root = copied(t),
    store = require(
      path.join(root, 'scripts/recovery/supabase-checkpoint-store.cjs'),
    ),
    w = store.createWorkspace(),
    base = fs.realpathSync(os.tmpdir());
  const parent = fs.mkdtempSync(path.join(base, 'biosphere-owner-output-'));
  fs.chmodSync(parent, 0o700);
  t.after(() => {
    for (const [dir, prefix] of [
      [w.checkpointDir, 'biosphere-platform-checkpoints-'],
      [w.keyDir, 'biosphere-platform-keys-'],
      [parent, 'biosphere-owner-output-'],
    ]) {
      const real = fs.realpathSync(dir);
      assert.equal(path.dirname(real), base);
      assert.ok(path.basename(real).startsWith(prefix));
      fs.rmSync(real, { recursive: true, force: true });
    }
  });
  const data = {
    payload: {
      format: 'biosphere-platform-fixture-v3',
      application: { profile: 'biosphere-full-v1' },
      example: 'owner bridge synthetic fixture',
    },
    verification: { expected: 'synthetic proof' },
    source: {
      owner: runId,
      ids: ['a', 'b', 'c', 'd', 'e'].map((c) => c.repeat(64)),
    },
  };
  store.saveCheckpoint(w.checkpointDir, w.keyDir, data);
  const target = {
    accountId: 'abc123abc123',
    bucketId: '1234567890abcdef12345678',
    bucketName: 'biosphere-owner-test',
    runId,
    namePrefix: 'synthetic/retention-' + runId + '/',
  };
  const expiration = Date.now() + 18000000,
    keys = {};
  for (const [i, role] of [
    'publisher',
    'fixtureWriter',
    'deletionProbe',
  ].entries()) {
    const caps = WRITER.filter(
      (c) => role === 'fixtureWriter' || c !== 'writeFileRetentions',
    );
    if (role === 'deletionProbe') {
      caps.splice(caps.indexOf('writeFiles'), 1);
      caps.push('deleteFiles');
    }
    keys[role] = {
      applicationKeyId: 'synthetic-key-' + i,
      applicationKey:
        role === 'fixtureWriter'
          ? 'DPAPI_SYNTHETIC_SECRET_CANARY'
          : 'UNUSED_' + role + '_SECRET_CANARY',
      keyName: 'synthetic-' + role,
      capabilities: caps,
      expirationTimestamp: expiration,
    };
  }
  const packet = { format: 'biosphere-b2-test-keys-v1', ...target, keys };
  if (scenario === 'expired') packet.keys.fixtureWriter.expirationTimestamp = 1;
  if (scenario === 'wrong-prefix') packet.namePrefix = 'synthetic/other/';
  if (scenario === 'broad-key')
    packet.keys.fixtureWriter.capabilities.push('writeKeys');
  if (scenario === 'partial') delete packet.keys.deletionProbe;
  const owner = path.join(root, '.recovery-rehearsals', 'b2-owner-' + runId);
  fs.mkdirSync(owner, { recursive: true });
  const input = path.join(root, 'synthetic-packet.json'),
    output = path.join(owner, 'test-keys.dpapi'),
    script = path.join(root, 'protect-synthetic.ps1');
  fs.writeFileSync(input, JSON.stringify(packet), { mode: 0o600 });
  fs.writeFileSync(
    script,
    `param([string]$InputPath,[string]$OutputPath)
$ErrorActionPreference='Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -ErrorAction Stop
Add-Type -AssemblyName System.Security
if(-not ('Security.Cryptography.ProtectedData' -as [type])){Add-Type -AssemblyName System.Security.Cryptography.ProtectedData}
$bytes=[IO.File]::ReadAllBytes($InputPath)
$cipher=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
[IO.File]::WriteAllBytes($OutputPath,$cipher)
`,
    { mode: 0o600 },
  );
  const host = hostInfo();
  const protectedResult = spawnSync(
    host.exe,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-File',
      script,
      '-InputPath',
      input,
      '-OutputPath',
      output,
    ],
    {
      env: host.env,
      windowsHide: true,
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 4096,
    },
  );
  assert.ifError(protectedResult.error);
  assert.equal(protectedResult.status, 0, protectedResult.stderr);
  assert.equal(protectedResult.stdout, '');
  if (scenario === 'corrupt')
    fs.writeFileSync(output, Buffer.from('not a DPAPI packet'));
  let saved, info;
  const calls = [];
  const json = (data) => ({
    status: 200,
    headers: {},
    body: Buffer.from(JSON.stringify(data)),
  });
  function serve(url, options, body) {
    calls.push({ url: String(url), options, body });
    const p = new URL(url).pathname;
    assert.equal(options.rejectUnauthorized, true);
    if (
      String(url) ===
      'https://api.backblazeb2.com/b2api/v4/b2_authorize_account'
    ) {
      const basic = Buffer.from(
        options.headers.Authorization.slice(6),
        'base64',
      ).toString();
      assert.equal(
        basic,
        keys.fixtureWriter.applicationKeyId +
          ':' +
          keys.fixtureWriter.applicationKey,
      );
      if (scenario === 'revoked')
        return {
          status: 401,
          headers: {},
          body: Buffer.from('{"message":"DPAPI_SYNTHETIC_SECRET_CANARY"}'),
        };
      const result = {
        accountId: target.accountId,
        authorizationToken: 'OWNER_SESSION_TOKEN_CANARY',
        applicationKeyExpirationTimestamp: expiration,
        apiInfo: {
          storageApi: {
            apiUrl: 'https://api001.backblazeb2.com',
            downloadUrl: 'https://f001.backblazeb2.com',
            allowed: {
              buckets: [{ id: target.bucketId, name: target.bucketName }],
              namePrefix: target.namePrefix,
              capabilities: [...WRITER],
            },
          },
        },
      };
      if (scenario === 'server-scope')
        result.apiInfo.storageApi.allowed.namePrefix = '';
      if (scenario === 'server-broad')
        result.apiInfo.storageApi.allowed.capabilities.push('writeKeys');
      return json(result);
    }
    if (p.endsWith('/b2_list_buckets'))
      return json({
        buckets: [
          {
            accountId: target.accountId,
            bucketId: target.bucketId,
            bucketName: target.bucketName,
            bucketType: 'allPrivate',
            lifecycleRules: [],
            fileLockConfiguration: {
              isClientAuthorizedToRead: true,
              value: {
                isFileLockEnabled: true,
                defaultRetention: { mode: null, period: null },
              },
            },
          },
        ],
      });
    if (p.endsWith('/b2_get_upload_url'))
      return json({
        bucketId: target.bucketId,
        uploadUrl:
          'https://pod-001.backblaze.com/b2api/v4/b2_upload_file/' +
          target.bucketId +
          '/cvt',
        authorizationToken: 'OWNER_UPLOAD_TOKEN_CANARY',
      });
    if (p.includes('/b2_upload_file/')) {
      saved = Buffer.from(body);
      info = {
        accountId: target.accountId,
        bucketId: target.bucketId,
        fileId: 'owner-version',
        fileName: options.headers['X-Bz-File-Name'],
        action: 'upload',
        contentLength: saved.length,
        contentSha1: createHash('sha1').update(saved).digest('hex'),
        fileRetention: {
          isClientAuthorizedToRead: true,
          value: {
            mode: 'governance',
            retainUntilTimestamp: Number(
              options.headers['X-Bz-File-Retention-Retain-Until-Timestamp'],
            ),
          },
        },
      };
      return json(info);
    }
    if (p.endsWith('/b2_get_file_info')) return json(info);
    if (p.endsWith('/b2_download_file_by_id'))
      return {
        status: 200,
        headers: { 'x-bz-file-id': 'owner-version' },
        body: Buffer.from(saved),
      };
    throw Error('Unexpected mocked bridge endpoint');
  }
  t.mock.method(https, 'request', (url, options, callback) => {
    const chunks = [];
    const req = new Writable({
      autoDestroy: false,
      write(chunk, encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
      final(done) {
        queueMicrotask(() => {
          try {
            const result = serve(url, options, Buffer.concat(chunks));
            const res = Readable.from([result.body]);
            res.statusCode = result.status;
            res.headers = result.headers;
            res.complete = true;
            callback(res);
          } catch (error) {
            req.destroy(error);
          }
        });
        done();
      },
    });
    return req;
  });
  const api = require(
    path.join(root, 'scripts/recovery/b2-owner-transfer.cjs'),
  );
  return {
    ...w,
    root,
    parent,
    packet,
    input,
    output,
    host,
    api,
    calls,
    data,
    store,
    scenario,
    options: {
      mode: 'publish',
      runId,
      host: host.host,
      checkpointDir: w.checkpointDir,
      keyDir: w.keyDir,
      confirmation: 'PUBLISH ONE SYNTHETIC CHECKPOINT',
    },
  };
}

test(
  'the owner bridge decrypts only a synthetic packet and completes the real checkpoint round trip',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const f = fixture(t);
    const result = await f.api.runOwnerTransfer(f.options);
    assert.equal(result.code, 'B2_CHECKPOINT_PUBLISHED');
    assert.equal(result.deploymentAuthorized, false);
    assert.ok(!JSON.stringify(result).includes('CANARY'));
    fs.unlinkSync(path.join(f.checkpointDir, 'checkpoint.bsp'));
    fs.unlinkSync(path.join(f.checkpointDir, 'checkpoint.json'));
    const destination = path.join(f.parent, 'recovered');
    const recovery = await f.api.runOwnerTransfer({
      mode: 'recover',
      runId,
      host: f.host.host,
      keyDir: f.keyDir,
      destination,
      confirmation: 'RECOVER ONE SYNTHETIC CHECKPOINT',
    });
    assert.equal(recovery.code, 'B2_CHECKPOINT_RECOVERED');
    assert.deepEqual(
      f.store.loadCheckpoint(destination, f.keyDir).payload,
      f.data.payload,
    );
    assert.equal(
      f.calls.filter((c) => c.url.includes('/b2_upload_file/')).length,
      1,
    );
    assert.equal(
      f.calls.filter((c) => c.url.endsWith('/b2_authorize_account')).length,
      2,
    );
    const privateReceipt = fs.readFileSync(
      path.join(f.keyDir, 'b2-transfer.private.json'),
      'utf8',
    );
    assert.ok(!privateReceipt.includes('CANARY'));
  },
);

test(
  'expired, corrupt, partial and wrong-scope packets stop before authorization',
  { skip: process.platform !== 'win32' },
  async (t) => {
    for (const scenario of [
      'expired',
      'corrupt',
      'partial',
      'wrong-prefix',
      'broad-key',
    ])
      await t.test(scenario, async (t) => {
        const f = fixture(t, scenario);
        await assert.rejects(
          f.api.runOwnerTransfer(f.options),
          (e) =>
            e.stage === 'KEY_PACKET' &&
            e.uploadMayExist === false &&
            !JSON.stringify(e).includes('CANARY'),
        );
        assert.equal(f.calls.length, 0);
      });
  },
);

test(
  'revoked or broadened server authorization stops before any upload',
  { skip: process.platform !== 'win32' },
  async (t) => {
    for (const scenario of ['revoked', 'server-scope', 'server-broad'])
      await t.test(scenario, async (t) => {
        const f = fixture(t, scenario);
        await assert.rejects(
          f.api.runOwnerTransfer(f.options),
          (e) =>
            e.stage === 'AUTHORIZE' &&
            e.uploadMayExist === false &&
            !JSON.stringify(e).includes('CANARY'),
        );
        assert.equal(f.calls.length, 1);
        assert.ok(f.calls[0].url.endsWith('/b2_authorize_account'));
      });
  },
);

test(
  'missing confirmation and unsupported credential arguments are rejected without network',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const f = fixture(t);
    await assert.rejects(
      f.api.runOwnerTransfer({ ...f.options, confirmation: 'no' }),
      (e) => e.stage === 'CONFIRMATION',
    );
    await assert.rejects(
      f.api.runOwnerTransfer({
        ...f.options,
        applicationKey: 'DO_NOT_ACCEPT_SECRET_CANARY',
      }),
      (e) => e.stage === 'OPTIONS',
    );
    assert.equal(f.calls.length, 0);
    const cli = spawnSync(
      process.execPath,
      [
        path.join(f.root, 'scripts/recovery/b2-owner-transfer.cjs'),
        '--key',
        'DO_NOT_ACCEPT_SECRET_CANARY',
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 10000, env: f.host.env },
    );
    assert.equal(cli.status, 1);
    assert.equal(cli.stderr, '');
    assert.ok(!cli.stdout.includes('CANARY'));
    assert.equal(JSON.parse(cli.stdout).stage, 'OPTIONS');
  },
);

test(
  'diagnostic runtime settings stop before credential access',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const f = fixture(t);
    const before = process.env.NODE_DEBUG;
    t.after(() => {
      if (before === undefined) delete process.env.NODE_DEBUG;
      else process.env.NODE_DEBUG = before;
    });
    process.env.NODE_DEBUG = 'https';
    await assert.rejects(
      f.api.runOwnerTransfer(f.options),
      (e) => e.stage === 'RUNTIME',
    );
    assert.equal(f.calls.length, 0);
  },
);
