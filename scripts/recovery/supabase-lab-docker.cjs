'use strict';
const { execFileSync } = require('node:child_process');
const allowed = new Set([
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
]);
function isolatedEnvironment(source = process.env) {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => allowed.has(key.toLowerCase())),
  );
}
function docker(args, input, binary = false, timeout = 90000) {
  const socket =
    process.platform === 'win32'
      ? 'npipe:////./pipe/dockerDesktopLinuxEngine'
      : 'unix:///var/run/docker.sock';
  try {
    const output = execFileSync('docker', ['--host', socket, ...args], {
      env: isolatedEnvironment(),
      input,
      encoding: binary ? undefined : 'utf8',
      windowsHide: true,
      timeout,
      maxBuffer: binary ? 32 * 1024 ** 2 : 1024 ** 2,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return binary ? output : output.trim();
  } catch {
    throw Object.assign(new Error('DOCKER_COMMAND_FAILED'), {
      safeCode: 'DOCKER_COMMAND_FAILED',
    });
  }
}
function inspectMany(kind, ids) {
  return JSON.parse(docker([kind, 'inspect', ...ids], undefined, false, 10000));
}
module.exports = { isolatedEnvironment, docker, inspectMany };
