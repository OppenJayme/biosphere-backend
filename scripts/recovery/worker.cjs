#!/usr/bin/env node
/** Standalone synthetic worker. No AppModule, dotenv, HTTP listener or supplied database URL. */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runRecorded, reconcileRecorded } = require('./cli.cjs');
const { verifyBuild } = require('./worker-build.cjs');
const IMAGE =
  'postgres@sha256:eee6c6e1b0894fa4fe0075eb054af9fd1cf39a35321c2d4110626cfe506411fb';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ID = /^[0-9a-f]{64}$/;
const HOST =
  process.platform === 'win32'
    ? 'npipe:////./pipe/dockerDesktopLinuxEngine'
    : 'unix:///var/run/docker.sock';
const OS_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
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
    ].includes(key.toLowerCase()),
  ),
);
function check(ok, code) {
  if (!ok) throw Object.assign(new Error(code), { safeCode: code });
}
function exact(value, keys) {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function canonical(file) {
  return process.platform === 'win32' ? file.toLowerCase() : file;
}
function readFile(file, max) {
  const stat = fs.lstatSync(file);
  check(
    stat.isFile() &&
      !stat.isSymbolicLink() &&
      stat.size <= max &&
      canonical(fs.realpathSync(file)) === canonical(path.resolve(file)),
    'WORKER_UNSAFE_FILE',
  );
  return fs.readFileSync(file, 'utf8');
}
function docker(args) {
  try {
    return execFileSync('docker', ['--host', HOST, ...args], {
      env: OS_ENV,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    check(false, 'WORKER_DOCKER_UNAVAILABLE');
  }
}
function historyExists(id) {
  return (
    docker([
      'container',
      'ls',
      '--all',
      '--no-trunc',
      '--filter',
      `id=${id}`,
      '--format',
      '{{.ID}}',
    ]) === id
  );
}
function historyDocker(id, args) {
  try {
    return docker(args);
  } catch (error) {
    // A successful empty listing distinguishes removal from an engine outage.
    check(historyExists(id), 'WORKER_HISTORY_EXPIRED');
    throw error;
  }
}
function inspectHistory(id) {
  check(historyExists(id), 'WORKER_HISTORY_EXPIRED');
  return JSON.parse(historyDocker(id, ['inspect', id]))[0];
}
function preflight(profileFile, historyFile) {
  check(
    ['win32', 'linux'].includes(process.platform),
    'WORKER_PLATFORM_UNSUPPORTED',
  );
  const root = path.dirname(path.resolve(profileFile));
  check(
    canonical(fs.realpathSync(root)) === canonical(root) &&
      canonical(path.dirname(path.resolve(historyFile))) === canonical(root) &&
      path.basename(historyFile) === 'recovery-history.private.json',
    'WORKER_UNSAFE_FILE',
  );
  const profile = JSON.parse(readFile(profileFile, 4096));
  check(
    exact(profile, [
      'format',
      'owner',
      'sourceContainer',
      'targetContainer',
      'image',
      'operator',
    ]) &&
      profile.format === 'biosphere-synthetic-recovery-v1' &&
      typeof profile.owner === 'string' &&
      UUID.test(profile.owner) &&
      profile.image === IMAGE &&
      profile.operator === 'synthetic-rehearsal' &&
      [profile.sourceContainer, profile.targetContainer].every(
        (id) => typeof id === 'string' && ID.test(id),
      ) &&
      profile.sourceContainer !== profile.targetContainer &&
      readFile(path.join(root, '.recovery-owner'), 128) === profile.owner,
    'WORKER_PROFILE_REJECTED',
  );
  const history = JSON.parse(readFile(historyFile, 4096));
  check(
    exact(history, [
      'format',
      'owner',
      'containerId',
      'port',
      'password',
      'marker',
    ]) &&
      history.format === 'biosphere-synthetic-history-v2' &&
      typeof history.owner === 'string' &&
      UUID.test(history.owner) &&
      typeof history.containerId === 'string' &&
      ID.test(history.containerId) &&
      Number.isInteger(history.port) &&
      history.port >= 1024 &&
      history.port <= 65535 &&
      typeof history.password === 'string' &&
      /^[a-f0-9]{32}$/.test(history.password) &&
      typeof history.marker === 'string' &&
      /^[a-f0-9]{64}$/.test(history.marker) &&
      ![profile.sourceContainer, profile.targetContainer].includes(
        history.containerId,
      ),
    'WORKER_HISTORY_REJECTED',
  );
  if (process.platform === 'linux') {
    check((fs.statSync(historyFile).mode & 0o077) === 0, 'WORKER_UNSAFE_FILE');
  }
  // Inspect actual containment and mapping before constructing any database client.
  const container = inspectHistory(history.containerId);
  const image = JSON.parse(docker(['image', 'inspect', IMAGE]))[0];
  const bindings = container.NetworkSettings?.Ports?.['5432/tcp'];
  check(
    container.Id === history.containerId &&
      container.State?.Running &&
      !container.State?.Paused &&
      container.Config?.Labels?.['biosphere.recovery-recording.owner'] ===
        history.owner &&
      container.Image === image.Id &&
      ['default', 'bridge'].includes(container.HostConfig?.NetworkMode) &&
      !container.HostConfig?.Binds?.length &&
      container.Mounts?.every((mount) => mount.Type === 'tmpfs') &&
      container.HostConfig?.LogConfig?.Type === 'none' &&
      Object.keys(container.NetworkSettings.Ports).length === 1 &&
      bindings?.length === 1 &&
      bindings[0].HostIp === '127.0.0.1' &&
      bindings[0].HostPort === String(history.port) &&
      typeof container.HostConfig?.Tmpfs?.['/var/lib/postgresql/data'] ===
        'string',
    'WORKER_HISTORY_REJECTED',
  );
  check(
    historyDocker(history.containerId, [
      'exec',
      history.containerId,
      'stat',
      '-f',
      '-c',
      '%T',
      '/var/lib/postgresql/data',
    ]) === 'tmpfs',
    'WORKER_HISTORY_REJECTED',
  );
  return history;
}
function argumentsFor(args) {
  const operation = args.shift();
  const flags = {};
  while (args.length) {
    const key = args.shift(),
      value = args.shift();
    check(
      ['--profile', '--history', '--snapshot', '--attempt'].includes(key) &&
        value &&
        !flags[key],
      'WORKER_INVALID_ARGUMENTS',
    );
    flags[key] = value;
  }
  check(
    ['capture', 'restore', 'verify', 'reconcile'].includes(operation) &&
      flags['--profile'] &&
      flags['--history'] &&
      (operation === 'capture'
        ? !flags['--snapshot'] && !flags['--attempt']
        : operation === 'reconcile'
          ? UUID.test(flags['--attempt']) && !flags['--snapshot']
          : UUID.test(flags['--snapshot']) && !flags['--attempt']),
    'WORKER_INVALID_ARGUMENTS',
  );
  return { operation, flags };
}
async function main(args) {
  if (args.length === 1 && args[0] === 'help') {
    return {
      status: 'HELP',
      scope: 'synthetic-only',
      usage:
        'capture|restore|verify|reconcile --profile FILE --history FILE [--snapshot UUID|--attempt UUID]',
    };
  }
  const { operation, flags } = argumentsFor(args);
  verifyBuild();
  const history = preflight(flags['--profile'], flags['--history']);
  // Strip inherited application/provider settings in this dedicated process only.
  for (const key of Object.keys(process.env))
    if (!Object.hasOwn(OS_ENV, key)) delete process.env[key];
  let PrismaService, RecoveryHistoryService;
  try {
    ({ PrismaService } = require('../../dist/prisma/prisma.service.js'));
    ({
      RecoveryHistoryService,
    } = require('../../dist/backup/recovery-history.service.js'));
  } catch {
    check(false, 'WORKER_BUILD_REQUIRED');
  }
  const { ConfigService } = require('@nestjs/config');
  const config = new ConfigService({
    DATABASE_URL: `postgresql://service_role:${history.password}@127.0.0.1:${history.port}/biosphere_recovery_recording_disposable`,
    RECOVERY_HISTORY_RECORDING_ENABLED: 'true',
    RECOVERY_HISTORY_OPERATOR_ID: 'synthetic-rehearsal',
  });
  const prisma = new PrismaService(config);
  async function requireDatabaseIdentity(client) {
    let rows;
    try {
      rows = await client.$queryRaw`SELECT owner::text, container_id, marker,
        current_database()::text AS db_name, current_user::text AS role_name
        FROM public.recovery_worker_identity WHERE singleton = true`;
    } catch {
      check(false, 'WORKER_HISTORY_IDENTITY_UNVERIFIABLE');
    }
    check(
      rows.length === 1 &&
        rows[0].owner === history.owner &&
        rows[0].container_id === history.containerId &&
        rows[0].marker === history.marker &&
        rows[0].db_name === 'biosphere_recovery_recording_disposable' &&
        rows[0].role_name === 'service_role',
      'WORKER_HISTORY_IDENTITY_MISMATCH',
    );
  }
  let result;
  try {
    await prisma.$connect();
    await requireDatabaseIdentity(prisma);
    // A pool-level check alone could verify a different connection from a write.
    // This narrow facade verifies identity on the actual transaction connection
    // before the unchanged recorder can read/write any history or audit row.
    const guardedPrisma = {
      $transaction: (work, options) =>
        prisma.$transaction(async (tx) => {
          await requireDatabaseIdentity(tx);
          return work(tx);
        }, options),
    };
    const recorder = new RecoveryHistoryService(guardedPrisma, config);
    result =
      operation === 'reconcile'
        ? await reconcileRecorded(
            { profileFile: flags['--profile'], attemptId: flags['--attempt'] },
            recorder,
          )
        : await runRecorded(
            {
              operation,
              profileFile: flags['--profile'],
              ...(flags['--snapshot']
                ? { snapshotId: flags['--snapshot'] }
                : {}),
            },
            recorder,
          );
  } catch (error) {
    result = {
      status: 'FAILED',
      history: 'NOT_RECORDED',
      code: error.safeCode || 'WORKER_HISTORY_UNAVAILABLE',
    };
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      if (result) result = { ...result, cleanup: 'HISTORY_DISCONNECT_FAILED' };
    }
  }
  return { ...result, workerPid: process.pid };
}
if (require.main === module) {
  main(process.argv.slice(2))
    .then((result) => {
      console.log(JSON.stringify(result));
      if (
        result.status !== 'HELP' &&
        (!['CAPTURED', 'RESTORED_VERIFIED', 'VERIFIED'].includes(
          result.status,
        ) ||
          result.history !== 'RECORDED' ||
          result.lock ||
          result.cleanup)
      )
        process.exitCode = 1;
    })
    .catch((error) => {
      console.log(
        JSON.stringify({
          status: 'FAILED',
          history: 'NOT_RECORDED',
          code: error.safeCode || 'WORKER_PREFLIGHT_FAILED',
        }),
      );
      process.exitCode = 1;
    });
}
