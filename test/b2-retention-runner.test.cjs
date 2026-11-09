'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const sourceRoot = path.resolve(__dirname, '..');
const runId = '12345678-1234-4234-8234-123456789abc';
const quote = (s) => "'" + s.replace(/'/g, "''") + "'";
function owned(t) {
  const base = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, 'biosphere-b2-retention-'));
  const scripts = path.join(root, 'scripts/recovery');
  fs.mkdirSync(scripts, { recursive: true });
  for (const file of ['b2-retention-runner.ps1', 'b2-retention-fixture.cjs']) {
    const src = path.join(sourceRoot, 'scripts/recovery', file);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(scripts, file));
  }
  t.after(() => {
    const resolved = fs.realpathSync(root);
    assert.equal(path.dirname(resolved), base);
    assert.ok(path.basename(resolved).startsWith('biosphere-b2-retention-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return root;
}
function invoke(root, args = '', prelude = '') {
  const psHome = process.argv.includes('--powershell7')
    ? path.join(process.env.ProgramFiles, 'PowerShell/7')
    : path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0');
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
    'ProgramFiles',
    'ProgramW6432',
    'CommonProgramFiles',
  ])
    if (process.env[k]) env[k] = process.env[k];
  env.PATH =
    path.join(process.env.SystemRoot, 'System32') + path.delimiter + psHome;
  env.PSModulePath = path.join(psHome, 'Modules');
  env.PSModuleAnalysisCachePath = 'NUL';
  const imports = ['Utility', 'Management', 'Security']
    .map(
      (n) =>
        'Import-Module ' +
        quote(
          path.join(
            psHome,
            'Modules',
            'Microsoft.PowerShell.' + n,
            'Microsoft.PowerShell.' + n + '.psd1',
          ),
        ) +
        ' -ErrorAction Stop;',
    )
    .join('\n');
  const wrapper = path.join(root, 'invoke-' + crypto.randomUUID() + '.ps1');
  fs.writeFileSync(
    wrapper,
    '\ufeff$PSModuleAutoLoadingPreference="None";\n' +
      imports +
      '\n' +
      prelude +
      '\n& ' +
      quote(path.join(root, 'scripts/recovery/b2-retention-runner.ps1')) +
      ' ' +
      args +
      '; exit $LASTEXITCODE',
    { flag: 'wx' },
  );
  let result;
  try {
    result = spawnSync(
      path.join(
        psHome,
        process.argv.includes('--powershell7') ? 'pwsh.exe' : 'powershell.exe',
      ),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'RemoteSigned',
        '-File',
        wrapper,
      ],
      {
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
        timeout: 30000,
        maxBuffer: 65536,
        windowsHide: true,
      },
    );
  } finally {
    fs.unlinkSync(wrapper);
  }
  assert.ifError(result.error);
  assert.equal(result.stderr, '');
  assert.ok(!result.stdout.includes('synthetic-secret-canary'));
  return {
    status: result.status,
    output: JSON.parse(result.stdout),
    raw: result.stdout,
  };
}
test(
  'default retention plan reads no key packet and makes no provider request',
  { skip: process.platform !== 'win32' },
  (t) => {
    const root = owned(t);
    const r = invoke(
      root,
      '',
      'function Read-Host {throw "NO_PROMPT"}; function Invoke-WebRequest {throw "NO_NETWORK"}',
    );
    assert.equal(r.status, 0);
    assert.equal(r.output.code, 'B2_RETENTION_PLAN');
    assert.equal(r.output.liveChanges, false);
    assert.equal(r.output.retentionMode, 'governance');
    assert.equal(r.output.retentionHours, 24);
  },
);
test(
  'Compliance and non-one-day requests stop before prompts, packet access or HTTP',
  { skip: process.platform !== 'win32' },
  async (t) => {
    for (const args of [
      '-RetentionMode compliance',
      '-RetentionHours 25',
      '-RetentionHours 1',
    ])
      await t.test(args, (t) => {
        const root = owned(t);
        const r = invoke(
          root,
          '-Run ' + args,
          'function Read-Host {throw "NO_PROMPT"}; function Invoke-WebRequest {throw "NO_NETWORK"}',
        );
        assert.equal(r.status, 1);
        assert.equal(r.output.stage, 'OPTIONS');
        assert.equal(r.output.uploadMayExist, false);
      });
  },
);

test(
  'declining the explicit one-day lock leaves no local attempt and makes no HTTP request',
  { skip: process.platform !== 'win32' },
  (t) => {
    const root = owned(t);
    const r = invoke(
      root,
      `-Run -RunId ${runId} -BucketName biosphere-test -NodeExecutable ${quote(process.execPath)}`,
      'function Read-Host {return "no"}; function Invoke-WebRequest {throw "NO_NETWORK"}',
    );
    assert.equal(r.status, 1);
    assert.equal(r.output.stage, 'CONFIRMATION');
    assert.equal(r.output.uploadMayExist, false);
    assert.ok(!fs.existsSync(path.join(root, '.recovery-rehearsals')));
  },
);

function provider(root, scenario = 'success') {
  return `
 $scenario=${quote(scenario)}
 $owner=Join-Path ${quote(root)} '.recovery-rehearsals/b2-owner-${runId}'
 [void][IO.Directory]::CreateDirectory($owner)
 Add-Type -AssemblyName System.Security
 $base=@('listBuckets','readBucketRetentions','readFileRetentions','readFiles')
 $keys=@{}; $ordinal=0
 foreach($role in @('publisher','fixtureWriter','deletionProbe')) {
  $ordinal++; $caps=$base+@('writeFiles')
  if($role -eq 'fixtureWriter'){$caps+=@('writeFileRetentions')}
  if($role -eq 'deletionProbe'){$caps=$base+@('deleteFiles')}
  $keys[$role]=@{applicationKeyId="key-$ordinal";applicationKey="synthetic-secret-canary-$role";keyName="test-$role";capabilities=$caps;expirationTimestamp=[DateTimeOffset]::UtcNow.AddHours(5).ToUnixTimeMilliseconds()}
 }
 $packet=@{format='biosphere-b2-test-keys-v1';runId='${runId}';accountId='test-account';bucketId='test-bucket-id';bucketName='biosphere-test';namePrefix='synthetic/retention-${runId}/';keys=$keys}
 if($scenario -eq 'broad-key'){$packet.keys.publisher.capabilities+=@('deleteFiles')}
 if($scenario -eq 'expired-key'){$packet.keys.publisher.expirationTimestamp=1}
 $cipher=[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes(($packet|ConvertTo-Json -Depth 12 -Compress)),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
 $packetPath=Join-Path $owner 'test-keys.dpapi'
 if([IO.File]::Exists($packetPath)){
  $existing=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($packetPath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
  $packet=[Text.Encoding]::UTF8.GetString($existing)|ConvertFrom-Json
  $keys=@{};foreach($existingRole in @('publisher','fixtureWriter','deletionProbe')){$keys[$existingRole]=$packet.keys.$existingRole}
 }else{[IO.File]::WriteAllBytes($packetPath,$cipher)}
 function Read-Host {return 'LOCK ONE SYNTHETIC FILE FOR ONE DAY'}
 class SyntheticB2Exception : System.Exception { [object]$Response; SyntheticB2Exception([int]$status):base('synthetic provider error'){$this.Response=[pscustomobject]@{StatusCode=$status}} }
 function Deny([int]$status,[string]$code){
  $record=[Management.Automation.ErrorRecord]::new([SyntheticB2Exception]::new($status),'SyntheticB2Error',[Management.Automation.ErrorCategory]::PermissionDenied,$null)
  $record.ErrorDetails=[Management.Automation.ErrorDetails]::new((@{status=$status;code=$code;message='synthetic-secret-canary'}|ConvertTo-Json -Compress));throw $record
 }
 $global:fixtureBytes=$null; $global:retentionEnd=0; $global:uploadCount=0; $global:deletes=0; $global:reads=0
 $global:expectedUploadUrl='https://pod-001.backblazeb2.com/b2api/v4/b2_upload_file/test-bucket-id/c001_v0001005_t0027'
 if($scenario -eq 'query-upload'){$global:expectedUploadUrl='https://pod-000-1005-03.backblaze.com/b2api/v4/b2_upload_file?cvt=c001_v0001005_t0027&bucket=test-bucket-id'}
 ${scenario.startsWith('url:') ? '$global:expectedUploadUrl=' + quote(scenario.slice(4)) : ''}
 function Invoke-WebRequest {
  param($Uri,$Method,$Headers,$Body,$ContentType,$TimeoutSec,$MaximumRedirection,[switch]$UseBasicParsing,$ErrorAction)
  [IO.File]::AppendAllText((Join-Path ${quote(root)} 'mock-requests.txt'),$Uri+"\n")
  if($MaximumRedirection -ne 0 -or $TimeoutSec -gt 20){throw 'REQUEST_BOUND'}
  $data=$null
  if($Uri -eq 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account'){
   $basic=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Headers.Authorization.Substring(6)))
   $role=@('publisher','fixtureWriter','deletionProbe')|Where-Object {$basic -eq ($keys[$_].applicationKeyId+':'+$keys[$_].applicationKey)}
   if(@($role).Count -ne 1){throw 'AUTH'}
   $allowed=[pscustomobject]@{buckets=@([pscustomobject]@{id='test-bucket-id';name='biosphere-test'});capabilities=$keys[$role].capabilities;namePrefix=$packet.namePrefix}
   if($scenario -eq 'wrong-prefix'){$allowed.namePrefix=''}
   $data=@{accountId='test-account';authorizationToken="token-$role";applicationKeyExpirationTimestamp=$keys[$role].expirationTimestamp;apiInfo=@{storageApi=@{apiUrl='https://api001.backblazeb2.com';downloadUrl='https://f001.backblazeb2.com';allowed=$allowed}}}
  }elseif($Uri -eq 'https://api001.backblazeb2.com/b2api/v4/b2_list_buckets'){
   $lock=[pscustomobject]@{isClientAuthorizedToRead=$true;value=[pscustomobject]@{isFileLockEnabled=$true;defaultRetention=[pscustomobject]@{mode=$null;period=$null}}}
   if($scenario -eq 'missing-lock'){$lock.value.isFileLockEnabled=$false}
   $data=@{buckets=@(@{bucketId='test-bucket-id';bucketName='biosphere-test';bucketType='allPrivate';fileLockConfiguration=$lock;lifecycleRules=@()})}
  }elseif($Uri -eq 'https://api001.backblazeb2.com/b2api/v4/b2_get_upload_url'){
   if($scenario -eq 'upload-url-timeout'){throw 'synthetic-secret-canary before any upload'}
   if($scenario -eq 'upload-url-server'){Deny 503 'service_unavailable'}
   $data=@{bucketId='test-bucket-id';uploadUrl=$global:expectedUploadUrl;authorizationToken='synthetic-secret-canary-upload'}
  }elseif($Uri -ceq $global:expectedUploadUrl){
   $global:uploadCount++;if($global:uploadCount -ne 1){throw 'DOUBLE_UPLOAD'}
   if($Headers.ContainsKey('X-Bz-File-Legal-Hold') -or $Headers.ContainsKey('X-Bz-Bypass-Governance')){throw 'FORBIDDEN_HEADER'}
   if($Headers['X-Bz-File-Retention-Mode'] -cne 'governance' -or $Body.Length -gt 1024){throw 'UPLOAD_BOUND'}
   if($scenario -eq 'literal-prefix' -and $Headers['X-Bz-File-Name'] -cne ($packet.namePrefix+'probe.enc')){throw 'FILENAME_ENCODING'}
   $global:retentionEnd=[long]$Headers['X-Bz-File-Retention-Retain-Until-Timestamp']
   $hours=($global:retentionEnd-[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())/3600000
   if($hours -lt 23.99 -or $hours -gt 24){throw 'RETENTION_BOUND'}
   $global:fixtureBytes=[byte[]]$Body
   if($scenario -eq 'upload-timeout'){throw 'synthetic-secret-canary uncertain upload'}
   $data=FileInfoResponse
  }elseif($Uri -eq 'https://api001.backblazeb2.com/b2api/v4/b2_get_file_info'){
   if(($Body|ConvertFrom-Json).fileId -cne 'version-1'){throw 'WRONG_VERSION_REQUEST'}
   $data=FileInfoResponse
   if($scenario -eq 'wrong-version'){$data.fileId='version-other'}
  }elseif($Uri -eq 'https://f001.backblazeb2.com/b2api/v4/b2_download_file_by_id?fileId=version-1'){
   $global:reads++
   $bytes=[byte[]]$global:fixtureBytes.Clone()
   if($scenario -eq 'corrupt-read'){$bytes[20]=$bytes[20] -bxor 1}
   $returnedId='version-1'
   if($scenario -eq 'array-header'){$returnedId=@('version-1')}
   if($scenario -eq 'ambiguous-header'){$returnedId=@('version-other','version-1')}
   return [pscustomobject]@{StatusCode=200;Headers=@{'X-Bz-File-Id'=$returnedId};RawContentStream=[IO.MemoryStream]::new($bytes)}
  }elseif($Uri -eq 'https://api001.backblazeb2.com/b2api/v4/b2_delete_file_version'){
   $global:deletes++
   $request=$Body|ConvertFrom-Json
   if($request.fileId -cne 'version-1' -or $request.fileName -cne ($packet.namePrefix+'probe.enc') -or $request.PSObject.Properties.Name -contains 'bypassGovernance'){throw 'DELETE_BOUND'}
   if($Headers.Authorization -eq 'token-publisher'){
    if($scenario -eq 'publisher-delete-succeeded'){return [pscustomobject]@{StatusCode=200;Content='{}';Headers=@{}}}
    Deny 401 'unauthorized'
   }
   if($Headers.Authorization -ne 'token-deletionProbe'){throw 'DELETE_ROLE'}
   if($scenario -eq 'expired-delete'){Deny 401 'expired_auth_token'}
   if($scenario -eq 'missing-delete'){Deny 400 'file_not_present'}
   if($scenario -eq 'server-delete'){Deny 503 'service_unavailable'}
   if($scenario -eq 'wrong-status-delete'){Deny 403 'access_denied'}
   if($scenario -eq 'allowed-delete'){$data=@{fileId='version-1';fileName=$request.fileName}}
   else{Deny 401 'access_denied'}
  }else{throw 'UNEXPECTED_NETWORK_DESTINATION'}
  return [pscustomobject]@{StatusCode=200;Content=($data|ConvertTo-Json -Depth 15 -Compress);Headers=@{}}
 }
 function FileInfoResponse {
  $sha=[Security.Cryptography.SHA1]::Create();try{$hash=([BitConverter]::ToString($sha.ComputeHash($global:fixtureBytes))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  $result=@{accountId='test-account';bucketId='test-bucket-id';fileId='version-1';fileName=($packet.namePrefix+'probe.enc');action='upload';contentLength=$global:fixtureBytes.Length;contentSha1=$hash;fileRetention=@{isClientAuthorizedToRead=$true;value=@{mode='governance';retainUntilTimestamp=$global:retentionEnd}}}
  if($scenario -eq 'compliance-read'){$result.fileRetention.value.mode='compliance'}
  if($scenario -eq 'wrong-deadline'){$result.fileRetention.value.retainUntilTimestamp++}
  return $result
 }
 `;
}
function run(root, scenario = 'success') {
  return invoke(
    root,
    `-Run -RunId ${runId} -BucketName biosphere-test -NodeExecutable ${quote(process.execPath)}`,
    provider(root, scenario),
  );
}

test(
  'the documented query-form upload URL completes the same bounded workflow',
  { skip: process.platform !== 'win32' },
  (t) => {
    const root = owned(t);
    const r = run(root, 'query-upload');
    assert.equal(r.status, 0, r.raw);
    assert.equal(r.output.code, 'B2_RETENTION_VERIFIED');
    assert.equal(r.output.deleteDenials, 2);
    assert.equal(r.output.versionReads, 3);
  },
);

test(
  'upload-URL failures leave no attempt and allow an explicit same-packet retry',
  { skip: process.platform !== 'win32' },
  async (t) => {
    for (const scenario of ['upload-url-timeout', 'upload-url-server'])
      await t.test(scenario, (t) => {
        const root = owned(t);
        const r = run(root, scenario);
        assert.equal(r.status, 1, r.raw);
        assert.equal(r.output.uploadMayExist, false);
        assert.equal(r.output.receiptRetained, false);
        const packetFile = path.join(
          root,
          `.recovery-rehearsals/b2-owner-${runId}/test-keys.dpapi`,
        );
        const packetBefore = fs.readFileSync(packetFile);
        const requests = fs.readFileSync(
          path.join(root, 'mock-requests.txt'),
          'utf8',
        );
        assert.ok(!requests.includes('/b2_upload_file'));
        assert.ok(!requests.includes('b2_delete_file_version'));
        const retry = run(root);
        assert.equal(retry.status, 0, retry.raw);
        assert.equal(retry.output.code, 'B2_RETENTION_VERIFIED');
        assert.ok(
          fs.readFileSync(packetFile).equals(packetBefore),
          'retry must reuse the exact protected packet',
        );
      });
  },
);
test(
  'one encrypted version survives both explicit deletion denials and remains decryptable',
  { skip: process.platform !== 'win32' },
  (t) => {
    const root = owned(t);
    const r = run(root);
    assert.equal(r.status, 0, r.raw);
    assert.equal(r.output.code, 'B2_RETENTION_VERIFIED');
    assert.equal(r.output.deleteDenials, 2);
    assert.equal(r.output.versionReads, 3);
    assert.equal(r.output.receiptRetained, true);
    assert.ok(
      fs.existsSync(
        path.join(
          root,
          `.recovery-rehearsals/b2-owner-${runId}/retention-attempt.dpapi`,
        ),
      ),
    );
    const inspection = invoke(
      root,
      `-Inspect -RunId ${runId}`,
      'function Read-Host {throw "NO_PROMPT"}; function Invoke-WebRequest {throw "NO_NETWORK"}',
    );
    assert.equal(inspection.status, 0);
    assert.equal(inspection.output.code, 'B2_RETENTION_RECEIPT');
    assert.equal(inspection.output.state, 'verified');
  },
);

test(
  'an uncertain upload retains its receipt and the same run cannot upload again',
  { skip: process.platform !== 'win32' },
  (t) => {
    const root = owned(t);
    const r = run(root, 'upload-timeout');
    assert.equal(r.status, 1);
    assert.equal(r.output.stage, 'UPLOAD');
    assert.equal(r.output.uploadMayExist, true);
    assert.equal(r.output.receiptRetained, true);
    const before = fs.readFileSync(
      path.join(root, 'mock-requests.txt'),
      'utf8',
    );
    const retry = run(root);
    assert.equal(retry.status, 1);
    assert.equal(retry.output.stage, 'LOCAL_PACKET');
    assert.equal(retry.output.uploadMayExist, true);
    assert.equal(retry.output.receiptRetained, true);
    assert.equal(
      fs.readFileSync(path.join(root, 'mock-requests.txt'), 'utf8'),
      before,
    );
  },
);

test(
  'invalid keys, provider scope and bucket protection stop before an upload attempt',
  { skip: process.platform !== 'win32' },
  async (t) => {
    for (const [scenario, stage] of [
      ['broad-key', 'LOCAL_PACKET'],
      ['expired-key', 'LOCAL_PACKET'],
      ['wrong-prefix', 'AUTHORIZATION'],
      ['missing-lock', 'BUCKET'],
    ])
      await t.test(scenario, (t) => {
        const root = owned(t);
        const r = run(root, scenario);
        assert.equal(r.status, 1, r.raw);
        assert.equal(r.output.stage, stage);
        assert.equal(r.output.uploadMayExist, false);
        assert.equal(r.output.receiptRetained, false);
        const requests = fs.existsSync(path.join(root, 'mock-requests.txt'))
          ? fs.readFileSync(path.join(root, 'mock-requests.txt'), 'utf8')
          : '';
        assert.ok(!requests.includes('b2_upload_file'));
        assert.ok(!requests.includes('b2_delete_file_version'));
      });
  },
);

test(
  'wrong versions, unreadable ciphertext and wrong retention never reach deletion',
  { skip: process.platform !== 'win32' },
  async (t) => {
    for (const scenario of [
      'wrong-version',
      'corrupt-read',
      'compliance-read',
      'wrong-deadline',
    ])
      await t.test(scenario, (t) => {
        const root = owned(t);
        const r = run(root, scenario);
        assert.equal(r.status, 1, r.raw);
        assert.equal(r.output.receiptRetained, true);
        assert.equal(r.output.uploadMayExist, true);
        assert.equal(r.output.deleteDenials, 0);
        assert.ok(
          !fs
            .readFileSync(path.join(root, 'mock-requests.txt'), 'utf8')
            .includes('b2_delete_file_version'),
        );
      });
  },
);

test(
  'an expired key, unrelated status, server failure or successful delete cannot count as retention denial',
  { skip: process.platform !== 'win32' },
  async (t) => {
    for (const scenario of [
      'expired-delete',
      'missing-delete',
      'server-delete',
      'wrong-status-delete',
      'allowed-delete',
    ])
      await t.test(scenario, (t) => {
        const root = owned(t);
        const r = run(root, scenario);
        assert.equal(r.status, 1, r.raw);
        assert.equal(r.output.stage, 'RETENTION_DELETE');
        assert.equal(r.output.deleteDenials, 1);
        assert.equal(r.output.versionReads, 2);
        assert.equal(r.output.receiptRetained, true);
        assert.equal(r.output.uploadMayExist, true);
      });
  },
);

test(
  'unexpected successful deletion has a distinct durable result for either role',
  { skip: process.platform !== 'win32' },
  async (t) => {
    for (const [scenario, role] of [
      ['allowed-delete', 'deletionProbe'],
      ['publisher-delete-succeeded', 'publisher'],
    ])
      await t.test(role, (t) => {
        const root = owned(t);
        const r = run(root, scenario);
        assert.equal(r.status, 1, r.raw);
        assert.equal(r.output.code, 'B2_RETENTION_DELETE_SUCCEEDED');
        assert.equal(r.output.receiptRetained, true);
        const inspection = invoke(
          root,
          `-Inspect -RunId ${runId}`,
          'function Invoke-WebRequest {throw "NO_NETWORK"}',
        );
        assert.equal(inspection.status, 0, inspection.raw);
        assert.equal(inspection.output.state, 'delete-succeeded');
        assert.equal(inspection.output.deleteRole, role);
        assert.equal(inspection.output.unexpectedDeleteSucceeded, true);
      });
  },
);

test(
  'the upload preserves literal prefix separators and accepts a single-valued header array',
  { skip: process.platform !== 'win32' },
  async (t) => {
    for (const scenario of ['literal-prefix', 'array-header'])
      await t.test(scenario, (t) => {
        const r = run(owned(t), scenario);
        assert.equal(r.status, 0, r.raw);
        assert.equal(r.output.code, 'B2_RETENTION_VERIFIED');
      });
  },
);

test(
  'ambiguous version headers stop before either deletion check',
  { skip: process.platform !== 'win32' },
  (t) => {
    const root = owned(t);
    const r = run(root, 'ambiguous-header');
    assert.equal(r.status, 1, r.raw);
    assert.equal(r.output.stage, 'VERSION_READ');
    assert.equal(r.output.deleteDenials, 0);
    assert.ok(
      !fs
        .readFileSync(path.join(root, 'mock-requests.txt'), 'utf8')
        .includes('b2_delete_file_version'),
    );
  },
);

test(
  'unsafe upload destinations and malformed query scopes do not reserve or send an upload',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const uploadPath = '/b2api/v4/b2_upload_file/test-bucket-id/cvt';
    const query = 'https://pod-001.backblaze.com/b2api/v4/b2_upload_file?';
    for (const url of [
      'http://pod-001.backblaze.com' + uploadPath,
      'https://pod-001.backblaze.com.evil.invalid' + uploadPath,
      'https://user@pod-001.backblaze.com' + uploadPath,
      'https://pod-001.backblaze.com:444' + uploadPath,
      'https://pod-001.backblaze.com' + uploadPath + '#fragment',
      'https://pod-001.backblaze.com/b2api/v4/b2_upload_file/other-bucket/cvt',
      query + 'cvt=token&bucket=other-bucket',
      query + 'cvt=token&bucket=test-bucket-id&bucket=test-bucket-id',
      query + 'bucket=test-bucket-id',
      query + 'cvt=token&bucket=test-bucket-id&extra=value',
    ])
      await t.test(url, (t) => {
        const root = owned(t);
        const r = run(root, 'url:' + url);
        assert.equal(r.status, 1, r.raw);
        assert.equal(r.output.stage, 'UPLOAD_URL');
        assert.equal(r.output.receiptRetained, false);
        assert.equal(r.output.uploadMayExist, false);
        const requests = fs.readFileSync(
          path.join(root, 'mock-requests.txt'),
          'utf8',
        );
        assert.ok(!requests.includes('/b2_upload_file'));
        assert.ok(!requests.includes('b2_delete_file_version'));
      });
  },
);
