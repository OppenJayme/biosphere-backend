'use strict';
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const source = path.resolve(
  __dirname,
  '../scripts/recovery/b2-owner-key-setup.ps1',
);
const quote = (s) => "'" + s.replace(/'/g, "''") + "'";
const usePowerShell7 = process.argv.includes('--powershell7');
function launch(command, useFile = false, bootstrap = true) {
  const env = {};
  for (const k of [
    'SystemRoot',
    'WINDIR',
    'SystemDrive',
    'ComSpec',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'ProgramData',
    'ProgramFiles',
    'ProgramFiles(x86)',
    'ProgramW6432',
    'CommonProgramFiles',
    'CommonProgramFiles(x86)',
    'CommonProgramW6432',
  ])
    if (process.env[k]) env[k] = process.env[k];
  const systemDirectory = path.join(process.env.SystemRoot, 'System32');
  const powershellDirectory = usePowerShell7
    ? path.join(process.env.ProgramFiles, 'PowerShell/7')
    : path.join(systemDirectory, 'WindowsPowerShell/v1.0');
  // Do not inherit the runner's PATH, custom modules, secrets or Node options.
  env.PATH = systemDirectory + path.delimiter + powershellDirectory;
  env.PSModulePath = path.join(powershellDirectory, 'Modules');
  env.PSModuleAnalysisCachePath = 'NUL';
  env.PSDisableModuleAnalysisCacheCleanup = '1';
  if (bootstrap) {
    const imports = ['Utility', 'Management', 'Security']
      .map(
        (name) =>
          'Import-Module ' +
          quote(
            path.join(
              env.PSModulePath,
              'Microsoft.PowerShell.' + name,
              'Microsoft.PowerShell.' + name + '.psd1',
            ),
          ) +
          ' -ErrorAction Stop;',
      )
      .join(' ');
    command =
      "$PSModuleAutoLoadingPreference='None'; " + imports + ' ' + command;
  }
  const wrapperBase = useFile ? fs.realpathSync(os.tmpdir()) : null;
  const wrapperRoot = useFile
    ? fs.mkdtempSync(path.join(wrapperBase, 'biosphere-b2-wrapper-'))
    : null;
  const wrapperFile = useFile ? path.join(wrapperRoot, 'invoke.ps1') : null;
  if (useFile)
    fs.writeFileSync(wrapperFile, '\ufeff' + command, { flag: 'wx' });
  let result;
  try {
    result = spawnSync(
      path.join(
        powershellDirectory,
        usePowerShell7 ? 'pwsh.exe' : 'powershell.exe',
      ),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'RemoteSigned',
        ...(useFile ? ['-File', wrapperFile] : ['-Command', command]),
      ],
      {
        encoding: 'utf8',
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 20000,
        maxBuffer: 65536,
        windowsHide: true,
      },
    );
  } finally {
    if (useFile) {
      assert.equal(path.dirname(fs.realpathSync(wrapperRoot)), wrapperBase);
      assert.ok(path.basename(wrapperRoot).startsWith('biosphere-b2-wrapper-'));
      fs.unlinkSync(wrapperFile);
      fs.rmdirSync(wrapperRoot);
    }
  }
  assert.ifError(result.error);
  return result;
}
if (process.platform === 'win32')
  before(() => {
    process.stdout.write(
      '# Test runtime: ' +
        (usePowerShell7 ? 'PowerShell 7' : 'Windows PowerShell 5.1') +
        '\n',
    );
    process.stdout.write('# Checking isolated PowerShell host startup\n');
    const host = launch(
      "[Console]::Out.WriteLine('B2_OWNER_TEST_HOST_READY'); exit 0",
      false,
      false,
    );
    assert.equal(host.status, 0);
    assert.equal(host.stderr, '');
    assert.equal(host.stdout.trim(), 'B2_OWNER_TEST_HOST_READY');
    process.stdout.write('# Checking native PowerShell JSON command\n');
    const jsonHost = launch(
      '@{ ready = $true } | ConvertTo-Json -Compress; exit 0',
    );
    assert.equal(jsonHost.status, 0);
    assert.equal(jsonHost.stderr, '');
    assert.deepEqual(JSON.parse(jsonHost.stdout), { ready: true });
    process.stdout.write('# Checking native PowerShell file entry point\n');
    const fileHost = launch(
      "[Console]::Out.WriteLine('B2_OWNER_TEST_HOST_READY'); exit 0",
      true,
    );
    assert.equal(fileHost.status, 0);
    assert.equal(fileHost.stderr, '');
    assert.equal(fileHost.stdout.trim(), 'B2_OWNER_TEST_HOST_READY');
    process.stdout.write('# Checking isolated helper plan startup\n');
    const plan = run(
      '-BucketName synthetic-test-bucket',
      'function Read-Host { throw "NO_PROMPT" }; function Invoke-RestMethod { throw "NO_NETWORK" }',
    );
    assert.equal(plan.status, 0);
    assert.equal(plan.output.code, 'B2_OWNER_SETUP_PLAN');
  });
function run(args, prelude = '', script = source) {
  const mode = args.includes('-Create')
    ? 'create'
    : args.includes('-Inspect')
      ? 'inspect'
      : 'plan';
  process.stdout.write('# Starting synthetic PowerShell ' + mode + '\n');
  const result = launch(
    prelude + '; & ' + quote(script) + ' ' + args + '; exit $LASTEXITCODE',
    true,
  );
  process.stdout.write(
    '# Synthetic PowerShell completed with exit ' + result.status + '\n',
  );
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes('admin-secret-canary'));
  return {
    status: result.status,
    output: JSON.parse(result.stdout),
    raw: result.stdout,
  };
}
test(
  'owner plan is read-only and never prompts or contacts B2 by default',
  { skip: process.platform !== 'win32' },
  () => {
    const r = run(
      '-BucketName synthetic-test-bucket',
      'function Read-Host { throw "NO_PROMPT" }; function Invoke-RestMethod { throw "NO_NETWORK" }',
    );
    assert.equal(r.status, 0);
    assert.equal(r.output.code, 'B2_OWNER_SETUP_PLAN');
    assert.equal(r.output.plannedKeys.length, 3);
    assert.equal(r.output.liveChanges, false);
  },
);
function ownedCopy(t) {
  const base = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, 'biosphere-b2-owner-'));
  const script = path.join(root, 'scripts/recovery/b2-owner-key-setup.ps1');
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(source, script);
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), base);
    assert.ok(path.basename(resolved).startsWith('biosphere-b2-owner-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return { root, script };
}
const provider = `
$global:syntheticProviderCreated = 0
function Read-Host {
 param([string]$Prompt,[switch]$AsSecureString)
 if ($AsSecureString) { if($Prompt -like '*ID*'){return ConvertTo-SecureString 'admin-id-canary' -AsPlainText -Force};return ConvertTo-SecureString 'admin-secret-canary' -AsPlainText -Force }
 return 'CREATE THREE TEST KEYS'
}
function Invoke-RestMethod {
 param($Uri,$Method,$Headers,$Body,$TimeoutSec,$MaximumRedirection,$ErrorAction)
 if($Uri -eq 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account') {
  return [pscustomobject]@{accountId='synthetic-account';authorizationToken='synthetic-admin-token';apiInfo=@{storageApi=@{apiUrl='https://api001.backblazeb2.com';allowed=@{capabilities=@('writeKeys','listBuckets','readBucketRetentions')}}}}
 }
 if($Uri -eq 'https://api001.backblazeb2.com/b2api/v4/b2_list_buckets') {
  return [pscustomobject]@{buckets=@(@{accountId='synthetic-account';bucketName='synthetic-test-bucket';bucketId='0123456789abcdef01234567';bucketType='allPrivate';lifecycleRules=@();fileLockConfiguration=@{isClientAuthorizedToRead=$true;value=@{isFileLockEnabled=$true;defaultRetention=@{mode=$null}}}})}
 }
 if($Uri -eq 'https://api001.backblazeb2.com/b2api/v4/b2_create_key') {
  $request=$Body|ConvertFrom-Json;$global:syntheticProviderCreated++
  if($request.accountId -ne 'synthetic-account' -or @($request.bucketIds).Count -ne 1 -or $request.bucketIds[0] -ne '0123456789abcdef01234567' -or $request.namePrefix -notmatch '^synthetic/retention-[a-f0-9-]{36}/$' -or $request.validDurationInSeconds -ne 21600){throw 'BAD_SCOPE'}
  return [pscustomobject]@{applicationKeyId=('synthetic-id-'+$global:syntheticProviderCreated);applicationKey=('generated-secret-canary-'+$global:syntheticProviderCreated);keyName=$request.keyName;bucketIds=$request.bucketIds;namePrefix=$request.namePrefix;capabilities=$request.capabilities;expirationTimestamp=([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()+21600000)}
 }
 throw 'UNEXPECTED_PROVIDER_REQUEST'
}`;
test(
  'owner setup creates exact scoped temporary roles and stores only protected key material',
  { skip: process.platform !== 'win32' },
  (t) => {
    const owned = ownedCopy(t);
    const r = run(
      '-Create -BucketName synthetic-test-bucket',
      provider,
      owned.script,
    );
    assert.equal(r.status, 0, r.raw);
    assert.equal(r.output.code, 'B2_TEST_KEYS_CREATED');
    assert.equal(r.output.createdCount, 3);
    assert.ok(!r.raw.includes('generated-secret-canary'));
    const packet = fs.readFileSync(
      path.join(
        owned.root,
        '.recovery-rehearsals',
        'b2-owner-' + r.output.runId,
        'test-keys.dpapi',
      ),
    );
    assert.ok(!packet.includes(Buffer.from('admin-secret-canary')));
    assert.ok(!packet.includes(Buffer.from('generated-secret-canary')));
    const inspected = run(
      '-Inspect -RunId ' + r.output.runId,
      'function Read-Host { throw "NO_PROMPT" }; function Invoke-RestMethod { throw "NO_NETWORK" }',
      owned.script,
    );
    assert.equal(inspected.status, 0);
    assert.equal(inspected.output.createdCount, 3);
    const roles = inspected.output.roles;
    assert.deepEqual(roles.publisher.capabilities, [
      'listBuckets',
      'readBucketRetentions',
      'readFileRetentions',
      'readFiles',
      'writeFiles',
    ]);
    assert.deepEqual(roles.fixtureWriter.capabilities, [
      'listBuckets',
      'readBucketRetentions',
      'readFileRetentions',
      'readFiles',
      'writeFiles',
      'writeFileRetentions',
    ]);
    assert.deepEqual(roles.deletionProbe.capabilities, [
      'listBuckets',
      'readBucketRetentions',
      'readFileRetentions',
      'readFiles',
      'deleteFiles',
    ]);
    assert.ok(!inspected.raw.includes('generated-secret-canary'));
  },
);
test(
  'unsafe target or authorization stops before any key creation',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const cases = [
      [
        'wrong bucket',
        "bucketName='synthetic-test-bucket'",
        "bucketName='other-test-bucket'",
      ],
      ['public bucket', "bucketType='allPrivate'", "bucketType='allPublic'"],
      ['lock disabled', 'isFileLockEnabled=$true', 'isFileLockEnabled=$false'],
      [
        'retention unreadable',
        'isClientAuthorizedToRead=$true',
        'isClientAuthorizedToRead=$false',
      ],
      ['unexpected default retention', 'mode=$null', "mode='compliance'"],
      [
        'missing key administration',
        "@('writeKeys','listBuckets','readBucketRetentions')",
        "@('listBuckets','readBucketRetentions')",
      ],
      [
        'untrusted returned destination',
        "apiUrl='https://api001.backblazeb2.com'",
        "apiUrl='https://example.invalid'",
      ],
    ];
    for (const [name, from, to] of cases)
      await t.test(name, (t) => {
        const owned = ownedCopy(t);
        const r = run(
          '-Create -BucketName synthetic-test-bucket',
          provider.replace(from, to),
          owned.script,
        );
        assert.equal(r.status, 1, r.raw);
        assert.equal(r.output.createdCount, 0);
        assert.equal(r.output.creationOutcomeUnknown, false);
      });
  },
);
test(
  'owner decline never requests administrative credentials or contacts B2',
  { skip: process.platform !== 'win32' },
  (t) => {
    const owned = ownedCopy(t);
    const r = run(
      '-Create -BucketName synthetic-test-bucket',
      'function Read-Host { param($Prompt,[switch]$AsSecureString) if($AsSecureString){throw "NO_CREDENTIAL_PROMPT"};return "NO" }; function Invoke-RestMethod { throw "NO_NETWORK" }',
      owned.script,
    );
    assert.equal(r.status, 1);
    assert.equal(r.output.stage, 'OWNER_CONFIRMATION');
    assert.equal(r.output.creationOutcomeUnknown, false);
  },
);
test(
  'a later timeout retains earlier protected keys and never retries unknown creation',
  { skip: process.platform !== 'win32' },
  (t) => {
    const owned = ownedCopy(t);
    const mock = provider.replace(
      '$global:syntheticProviderCreated++',
      '$global:syntheticProviderCreated++; if($global:syntheticProviderCreated -eq 2){throw "MOCK_HTTP_TIMEOUT"}',
    );
    const r = run(
      '-Create -BucketName synthetic-test-bucket',
      mock,
      owned.script,
    );
    assert.equal(r.status, 1);
    assert.equal(r.output.createdCount, 1);
    assert.equal(r.output.creationOutcomeUnknown, true);
    assert.equal(r.output.stage, 'CREATE_fixtureWriter');
    const inspected = run(
      '-Inspect -RunId ' + r.output.runId,
      'function Invoke-RestMethod { throw "NO_NETWORK" }',
      owned.script,
    );
    assert.equal(inspected.status, 0);
    assert.equal(inspected.output.createdCount, 1);
    assert.deepEqual(Object.keys(inspected.output.roles), ['publisher']);
  },
);
test(
  'unexpected key scopes in the provider receipt remain an unknown outcome',
  { skip: process.platform !== 'win32' },
  (t) => {
    const owned = ownedCopy(t);
    const mock = provider.replace(
      'capabilities=$request.capabilities',
      "capabilities=@($request.capabilities+'deleteFiles')",
    );
    const r = run(
      '-Create -BucketName synthetic-test-bucket',
      mock,
      owned.script,
    );
    assert.equal(r.status, 1);
    assert.equal(r.output.createdCount, 0);
    assert.equal(r.output.creationOutcomeUnknown, true);
    assert.equal(r.output.stage, 'VERIFY_RETURNED_publisher');
  },
);
test(
  'reused provider key identity is rejected without discarding the first role',
  { skip: process.platform !== 'win32' },
  (t) => {
    const owned = ownedCopy(t);
    const mock = provider.replace(
      "applicationKeyId=('synthetic-id-'+$global:syntheticProviderCreated)",
      "applicationKeyId='synthetic-id-duplicate'",
    );
    const r = run(
      '-Create -BucketName synthetic-test-bucket',
      mock,
      owned.script,
    );
    assert.equal(r.status, 1, r.raw);
    assert.equal(r.output.createdCount, 1);
    assert.equal(r.output.creationOutcomeUnknown, true);
    assert.equal(r.output.stage, 'VERIFY_RETURNED_fixtureWriter');
  },
);
test(
  'string-valued safety flags are not trusted as provider booleans',
  { skip: process.platform !== 'win32' },
  (t) => {
    const owned = ownedCopy(t);
    const r = run(
      '-Create -BucketName synthetic-test-bucket',
      provider.replace('isFileLockEnabled=$true', "isFileLockEnabled='true'"),
      owned.script,
    );
    assert.equal(r.status, 1, r.raw);
    assert.equal(r.output.createdCount, 0);
    assert.equal(r.output.creationOutcomeUnknown, false);
  },
);
