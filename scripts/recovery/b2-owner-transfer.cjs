'use strict';
// One-off owner tool. No application route, scheduler, administrative key or
// environment credentials. The default is a network/file-read-free plan.
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { requestB2 } = require('./b2-native-request.cjs');
const {
  publishCheckpoint,
  recoverCheckpoint,
} = require('./b2-checkpoint-transfer.cjs');
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const CAPS = [
  'listBuckets',
  'readBucketRetentions',
  'readFileRetentions',
  'readFiles',
  'writeFiles',
  'writeFileRetentions',
];
function assert(ok) {
  if (!ok) throw Error('B2_OWNER_INPUT_INVALID');
}
function equalCaps(caps) {
  return (
    Array.isArray(caps) &&
    caps.length === CAPS.length &&
    new Set(caps).size === caps.length &&
    CAPS.every((c) => caps.includes(c))
  );
}
function childEnvironment(home) {
  const env = {};
  for (const n of [
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
    if (process.env[n]) env[n] = process.env[n];
  env.PATH =
    path.join(process.env.SystemRoot, 'System32') + path.delimiter + home;
  env.PSModulePath = path.join(home, 'Modules');
  env.PSModuleAnalysisCachePath = 'NUL';
  return env;
}
async function readOwnerPacket(runId, host) {
  const home =
    host === 'ps7'
      ? path.join(process.env.ProgramFiles, 'PowerShell/7')
      : path.join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0');
  const exe = path.join(home, host === 'ps7' ? 'pwsh.exe' : 'powershell.exe'),
    helper = path.join(__dirname, 'b2-read-owner-packet.ps1');
  for (const file of [exe, helper]) {
    const stat = fs.lstatSync(file);
    assert(stat.isFile() && !stat.isSymbolicLink());
  }
  const nonce = randomBytes(32).toString('hex');
  const packet = await new Promise((resolve, reject) => {
    const child = childProcess.execFile(
      exe,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-File',
        helper,
        '-RunId',
        runId,
      ],
      {
        cwd: path.resolve(__dirname, '../..'),
        env: childEnvironment(home),
        windowsHide: true,
        timeout: 10000,
        maxBuffer: 16384,
        encoding: 'utf8',
        killSignal: 'SIGKILL',
      },
      (error, stdout, stderr) => {
        if (error || stderr.length) {
          reject(Error('B2_OWNER_PACKET_UNAVAILABLE'));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(Error('B2_OWNER_PACKET_UNAVAILABLE'));
        }
      },
    );
    child.stdin.on('error', () => {});
    child.stdin.end('BIOSPHERE_OWNER_PIPE_V1:' + nonce + '\n');
  });
  assert(
    packet?.format === 'biosphere-owner-session-input-v1' &&
      packet.nonce === nonce &&
      packet.role === 'fixtureWriter',
  );
  const { target, key } = packet;
  assert(
    target &&
      Object.keys(target).length === 5 &&
      target.runId === runId &&
      target.namePrefix === 'synthetic/retention-' + runId + '/',
  );
  for (const n of ['accountId', 'bucketId', 'bucketName'])
    assert(
      typeof target[n] === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(target[n]),
    );
  assert(
    key &&
      typeof key.applicationKeyId === 'string' &&
      /^[A-Za-z0-9_-]{8,128}$/.test(key.applicationKeyId) &&
      typeof key.applicationKey === 'string' &&
      /^[A-Za-z0-9_+/=.-]{8,256}$/.test(key.applicationKey) &&
      equalCaps(key.capabilities),
  );
  const left = key.expirationTimestamp - Date.now();
  assert(
    Number.isSafeInteger(key.expirationTimestamp) &&
      left > 600000 &&
      left <= 21630000,
  );
  return packet;
}
function validateSession(session, packet) {
  const { target, key } = packet,
    api = session?.apiInfo?.storageApi,
    allowed = api?.allowed;
  assert(
    session?.accountId === target.accountId &&
      session.applicationKeyExpirationTimestamp === key.expirationTimestamp,
  );
  assert(
    typeof session.authorizationToken === 'string' &&
      session.authorizationToken.length > 0 &&
      session.authorizationToken.length <= 8192 &&
      !/[\r\n]/.test(session.authorizationToken),
  );
  assert(
    typeof api.apiUrl === 'string' &&
      /^https:\/\/api[0-9]+\.backblazeb2\.com\/?$/.test(api.apiUrl) &&
      typeof api.downloadUrl === 'string' &&
      /^https:\/\/f[0-9]+\.backblazeb2\.com\/?$/.test(api.downloadUrl),
  );
  assert(
    Array.isArray(allowed.buckets) &&
      allowed.buckets.length === 1 &&
      allowed.buckets[0].id === target.bucketId &&
      allowed.buckets[0].name === target.bucketName &&
      allowed.namePrefix === target.namePrefix &&
      equalCaps(allowed.capabilities),
  );
  return session;
}
async function runOwnerTransfer(options = {}) {
  let stage = 'OPTIONS',
    packet,
    session;
  try {
    assert(options && typeof options === 'object' && !Array.isArray(options));
    const names = [
      'mode',
      'runId',
      'checkpointDir',
      'keyDir',
      'destination',
      'host',
      'confirmation',
    ];
    assert(Object.keys(options).every((n) => names.includes(n)));
    const mode = options.mode ?? 'plan';
    if (mode === 'plan') {
      assert(Object.keys(options).every((n) => n === 'mode'));
      return {
        code: 'B2_OWNER_TRANSFER_PLAN',
        liveChanges: false,
        platform: 'windows-owner-only',
        role: 'fixtureWriter',
        deploymentAuthorized: false,
      };
    }
    assert(mode === 'publish' || mode === 'recover');
    assert(typeof options.runId === 'string' && UUID.test(options.runId));
    const host = options.host ?? 'ps7';
    assert(host === 'ps7' || host === 'windows-powershell');
    assert(
      typeof options.keyDir === 'string' && path.isAbsolute(options.keyDir),
    );
    if (mode === 'publish')
      assert(
        typeof options.checkpointDir === 'string' &&
          path.isAbsolute(options.checkpointDir) &&
          options.destination === undefined,
      );
    else
      assert(
        typeof options.destination === 'string' &&
          path.isAbsolute(options.destination) &&
          options.checkpointDir === undefined,
      );
    stage = 'CONFIRMATION';
    assert(
      options.confirmation ===
        (mode === 'publish'
          ? 'PUBLISH ONE SYNTHETIC CHECKPOINT'
          : 'RECOVER ONE SYNTHETIC CHECKPOINT'),
    );
    stage = 'PLATFORM';
    assert(process.platform === 'win32');
    stage = 'RUNTIME';
    assert(
      [
        'NODE_DEBUG',
        'NODE_DEBUG_NATIVE',
        'NODE_OPTIONS',
        'NODE_V8_COVERAGE',
        'SSLKEYLOGFILE',
      ].every((name) => !process.env[name]),
    );
    assert(
      !process.execArgv.some(
        (arg) =>
          /^--(?:inspect|debug|tls-keylog|require|import|trace)/.test(arg) ||
          arg === '-r',
      ),
    );
    stage = 'KEY_PACKET';
    packet = await readOwnerPacket(options.runId, host);
    stage = 'AUTHORIZE';
    const basic = Buffer.from(
      packet.key.applicationKeyId + ':' + packet.key.applicationKey,
    ).toString('base64');
    const response = await requestB2({
      url: 'https://api.backblazeb2.com/b2api/v4/b2_authorize_account',
      method: 'GET',
      headers: { Authorization: 'Basic ' + basic },
      timeoutMs: 20000,
      maxResponseBytes: 65536,
      followRedirects: false,
    });
    try {
      session = validateSession(
        JSON.parse(response.body.toString('utf8')),
        packet,
      );
    } finally {
      response.body.fill(0);
    }
    packet.key.applicationKey = '';
    stage = 'TRANSFER';
    const shared = {
      target: packet.target,
      session,
      keyDir: options.keyDir,
      request: requestB2,
    };
    return mode === 'publish'
      ? await publishCheckpoint({
          ...shared,
          checkpointDir: options.checkpointDir,
        })
      : await recoverCheckpoint({
          ...shared,
          destination: options.destination,
        });
  } catch (error) {
    const detail =
      typeof error?.safeCode === 'string' &&
      /^(B2_TRANSFER|CHECKPOINT|B2_NATIVE)_[A-Z0-9_]+$/.test(error.safeCode)
        ? error.safeCode
        : undefined;
    throw Object.assign(new Error('B2_OWNER_TRANSFER_FAILED'), {
      code: 'B2_OWNER_TRANSFER_FAILED',
      stage,
      detail,
      uploadMayExist: error?.uploadMayExist === true,
      deploymentAuthorized: false,
    });
  } finally {
    if (packet?.key) packet.key.applicationKey = '';
    packet = undefined;
    session = undefined;
  }
}
function parseArgs(args) {
  if (!args.length) return {};
  const names = {
      '--mode': 'mode',
      '--run-id': 'runId',
      '--checkpoints': 'checkpointDir',
      '--keys': 'keyDir',
      '--destination': 'destination',
      '--host': 'host',
      '--confirm': 'confirmation',
    },
    result = {};
  assert(args.length % 2 === 0);
  for (let i = 0; i < args.length; i += 2) {
    const key = names[args[i]];
    assert(
      typeof key === 'string' &&
        !(key in result) &&
        typeof args[i + 1] === 'string' &&
        !args[i + 1].startsWith('--'),
    );
    result[key] = args[i + 1];
  }
  return result;
}
if (require.main === module) {
  Promise.resolve()
    .then(() => runOwnerTransfer(parseArgs(process.argv.slice(2))))
    .then(
      (result) => {
        process.stdout.write(JSON.stringify(result) + '\n');
      },
      (error) => {
        process.stdout.write(
          JSON.stringify({
            code: 'B2_OWNER_TRANSFER_FAILED',
            stage: error.stage ?? 'OPTIONS',
            detail: error.detail,
            uploadMayExist: error.uploadMayExist === true,
            deploymentAuthorized: false,
          }) + '\n',
        );
        process.exitCode = 1;
      },
    );
}
module.exports = { runOwnerTransfer };
