'use strict';
// Accidental stale-build detection for a trusted checkout, not code signing.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const stampFile = path.join(root, 'dist/recovery-worker-build.json');
function failure(code) {
  throw Object.assign(new Error(code), { safeCode: code });
}
function fingerprint(inputs, output = false) {
  const files = [];
  function visit(relative) {
    const absolute = path.join(root, relative);
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) failure('WORKER_BUILD_REQUIRED');
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort())
        visit(path.join(relative, name));
    } else if (stat.isFile()) {
      if (
        output &&
        (absolute === stampFile ||
          /(?:\.map|\.d\.ts|\.tsbuildinfo)$/.test(relative))
      )
        return;
      if (!output && /\.(?:spec|test)\.ts$/.test(relative)) return;
      if (
        (output || relative.startsWith('src' + path.sep)) &&
        !/\.(?:[cm]?js|ts|json|wasm|node)$/.test(relative)
      )
        return;
      files.push(relative);
    } else failure('WORKER_BUILD_REQUIRED');
  }
  for (const input of inputs) visit(input);
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    const bytes = fs.readFileSync(path.join(root, file));
    hash.update(file.split(path.sep).join('/') + '\0' + bytes.length + '\0');
    hash.update(bytes);
  }
  return hash.digest('hex');
}
function sourceFingerprint() {
  return fingerprint([
    'src',
    'prisma/schema.prisma',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.build.json',
    'nest-cli.json',
    'scripts/recovery/worker.cjs',
    'scripts/recovery/cli.cjs',
    'scripts/recovery/worker-build.cjs',
  ]);
}
function current() {
  for (const file of [
    'dist/prisma/prisma.service.js',
    'dist/backup/recovery-history.service.js',
  ])
    if (!fs.existsSync(path.join(root, file))) failure('WORKER_BUILD_REQUIRED');
  return {
    format: 'biosphere-worker-build-v1',
    source: sourceFingerprint(),
    runtime: fingerprint(['dist'], true),
  };
}
function verifyBuild() {
  let saved, actual;
  try {
    const stat = fs.lstatSync(stampFile);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024)
      failure('WORKER_BUILD_REQUIRED');
    saved = JSON.parse(fs.readFileSync(stampFile, 'utf8'));
    actual = current();
  } catch {
    failure('WORKER_BUILD_REQUIRED');
  }
  if (
    !saved ||
    saved.format !== actual.format ||
    Object.keys(saved).length !== 3 ||
    saved.source !== actual.source ||
    saved.runtime !== actual.runtime
  )
    failure('WORKER_BUILD_STALE');
}
if (require.main === module) {
  try {
    if (process.argv.length !== 3 || process.argv[2] !== 'build')
      failure('WORKER_BUILD_INVALID_ARGUMENTS');
    const before = sourceFingerprint();
    const output = path.join(root, 'dist');
    if (fs.existsSync(output) && fs.lstatSync(output).isSymbolicLink())
      failure('WORKER_BUILD_REQUIRED');
    if (fs.existsSync(stampFile)) {
      const old = fs.lstatSync(stampFile);
      if (!old.isFile() || old.isSymbolicLink())
        failure('WORKER_BUILD_REQUIRED');
      fs.unlinkSync(stampFile);
    }
    try {
      execFileSync(
        process.execPath,
        [path.join(root, 'node_modules/@nestjs/cli/bin/nest.js'), 'build'],
        {
          cwd: root,
          windowsHide: true,
          stdio: 'inherit',
          timeout: 600000,
        },
      );
    } catch {
      failure('WORKER_BUILD_FAILED');
    }
    const completed = current();
    if (completed.source !== before) failure('WORKER_BUILD_INPUT_CHANGED');
    fs.writeFileSync(stampFile, JSON.stringify(completed) + '\n', {
      mode: 0o600,
      flag: 'wx',
    });
    console.log('Recovery worker build stamp written.');
  } catch (error) {
    console.error(error.safeCode ?? 'WORKER_BUILD_REQUIRED');
    process.exitCode = 1;
  }
}
module.exports = { verifyBuild };
