#!/usr/bin/env node
/**
 * Records which src/ tree produced dist/, so the standalone worker can refuse a
 * stale build (for example after a pull without `npm run build`).
 * Runs as the `postbuild` npm hook; the worker verifies it before loading dist/.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const FORMAT = 'biosphere-worker-build-v1';
const STAMP = path.join('dist', '.recovery-worker-build.json');
// Spec files are not compiled into dist/, so editing them does not stale a build.
const SKIPPED = /\.spec\.ts$/;

function sourceFiles(directory, root, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) sourceFiles(full, root, files);
    else if (entry.isFile() && !SKIPPED.test(entry.name))
      files.push(path.relative(root, full).split(path.sep).join('/'));
  }
  return files;
}

/** Hash of every compiled source path and its bytes under <root>/src. */
function sourceDigest(root) {
  const hash = createHash('sha256');
  for (const file of sourceFiles(path.join(root, 'src'), root).sort()) {
    const bytes = fs.readFileSync(path.join(root, file));
    hash.update(`${file}\0${bytes.length}\0`).update(bytes);
  }
  return hash.digest('hex');
}

function writeStamp(root) {
  const file = path.join(root, STAMP);
  fs.writeFileSync(
    file,
    JSON.stringify({ format: FORMAT, source: sourceDigest(root) }) + '\n',
  );
  return file;
}

/** 'CURRENT', 'MISSING' (never stamped) or 'STALE' (src changed since the build). */
function stampStatus(root) {
  let stamp;
  try {
    stamp = JSON.parse(fs.readFileSync(path.join(root, STAMP), 'utf8'));
  } catch {
    return 'MISSING';
  }
  if (!stamp || stamp.format !== FORMAT || typeof stamp.source !== 'string')
    return 'MISSING';
  return stamp.source === sourceDigest(root) ? 'CURRENT' : 'STALE';
}

module.exports = { STAMP, sourceDigest, writeStamp, stampStatus };

if (require.main === module) {
  writeStamp(path.resolve(__dirname, '..', '..'));
}
