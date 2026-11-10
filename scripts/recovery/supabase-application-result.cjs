'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const FORMAT = 'biosphere-application-result-v1';
function createScratch() {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'biosphere-app-recovery-'),
  );
  const owner = randomUUID();
  if (process.platform !== 'win32') fs.chmodSync(directory, 0o700);
  fs.writeFileSync(path.join(directory, '.lab-owner'), owner, {
    flag: 'wx',
    mode: 0o600,
  });
  return { directory, owner };
}
function removeScratch(scratch) {
  const stat = fs.lstatSync(scratch.directory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink());
  const actual = fs.realpathSync(scratch.directory),
    temp = fs.realpathSync(os.tmpdir());
  const canonical = (value) =>
    process.platform === 'win32' ? value.toLowerCase() : value;
  assert.equal(canonical(path.dirname(actual)), canonical(temp));
  assert.ok(path.basename(actual).startsWith('biosphere-app-recovery-'));
  assert.match(scratch.owner, /^[a-f0-9-]{36}$/);
  const marker = path.join(actual, '.lab-owner'),
    ownerStat = fs.lstatSync(marker);
  assert.ok(
    ownerStat.isFile() &&
      !ownerStat.isSymbolicLink() &&
      ownerStat.nlink === 1 &&
      ownerStat.size === 36,
  );
  assert.equal(fs.readFileSync(marker, 'utf8'), scratch.owner);
  // The resolved absolute target is a freshly owned direct child of Temp,
  // with a matching per-run marker. Never recursively delete any other root.
  fs.rmSync(actual, { recursive: true, force: false, maxRetries: 1 });
}
async function finalizeApplicationResult({
  result = null,
  code = null,
  app,
  scratch,
  cwd,
}) {
  const cleanupFailures = [];
  if (app) {
    let timer;
    try {
      await Promise.race([
        Promise.resolve().then(() => app.close()),
        new Promise((resolve, reject) => {
          timer = setTimeout(() => reject(Error('close timeout')), 5000);
        }),
      ]);
    } catch {
      cleanupFailures.push('APP_CLOSE_FAILED');
    } finally {
      clearTimeout(timer);
    }
  }
  if (scratch) {
    try {
      process.chdir(cwd);
    } catch {
      cleanupFailures.push('CWD_RESTORE_FAILED');
    }
    try {
      removeScratch(scratch);
    } catch {
      cleanupFailures.push('SCRATCH_CLEANUP_FAILED');
    }
  }
  return {
    format: FORMAT,
    verification: result ? 'PASSED' : 'FAILED',
    code,
    result,
    cleanup: cleanupFailures.length ? 'FAILED' : 'COMPLETE',
    cleanupFailures,
  };
}
function readApplicationResult(child) {
  const fail = (code) => {
    throw Object.assign(Error(code), { safeCode: code });
  };
  if (child.error || child.signal || ![0, 1].includes(child.status))
    fail('APPLICATION_CHECK_TRANSPORT_FAILED');
  try {
    assert.ok(Buffer.byteLength(child.stdout, 'utf8') <= 16384);
    const report = JSON.parse(child.stdout);
    assert.equal(Object.keys(report).length, 6);
    assert.equal(report.format, FORMAT);
    assert.ok(['PASSED', 'FAILED'].includes(report.verification));
    assert.ok(['COMPLETE', 'FAILED'].includes(report.cleanup));
    assert.ok(
      Array.isArray(report.cleanupFailures) &&
        report.cleanupFailures.every((c) =>
          [
            'APP_CLOSE_FAILED',
            'CWD_RESTORE_FAILED',
            'SCRATCH_CLEANUP_FAILED',
          ].includes(c),
        ),
    );
    assert.equal(
      report.cleanup === 'COMPLETE',
      report.cleanupFailures.length === 0,
    );
    if (report.verification === 'PASSED') {
      assert.equal(report.code, null);
      assert.deepEqual(report.result, {
        application: 'PROTECTED_HTTP_VERIFIED',
        applicationUnauthorized: 'DENIED',
        applicationMedia: 'SIGNED_BYTES_PRESERVED',
      });
    } else {
      assert.match(report.code, /^LAB_APPLICATION_[A-Z_]+_FAILED$/);
      assert.equal(report.result, null);
    }
    assert.equal(
      child.status,
      report.verification === 'PASSED' && report.cleanup === 'COMPLETE' ? 0 : 1,
    );
    return report;
  } catch {
    fail('APPLICATION_CHECK_PROTOCOL_FAILED');
  }
}
module.exports = {
  createScratch,
  finalizeApplicationResult,
  readApplicationResult,
};
