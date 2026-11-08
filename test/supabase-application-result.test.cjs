const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const verified = {
  application: 'PROTECTED_HTTP_VERIFIED',
  applicationUnauthorized: 'DENIED',
  applicationMedia: 'SIGNED_BYTES_PRESERVED',
};

test('failed app close preserves verified outcome and still removes owned scratch contents', async () => {
  const {
    createScratch,
    finalizeApplicationResult,
  } = require('../scripts/recovery/supabase-application-result.cjs');
  const scratch = createScratch();
  fs.writeFileSync(path.join(scratch.directory, 'extra.txt'), 'synthetic');
  const report = await finalizeApplicationResult({
    result: verified,
    code: null,
    app: {
      close: async () => {
        throw Error('synthetic close failure');
      },
    },
    scratch,
    cwd: process.cwd(),
  });
  assert.equal(report.verification, 'PASSED');
  assert.equal(report.code, null);
  assert.equal(report.cleanup, 'FAILED');
  assert.deepEqual(report.cleanupFailures, ['APP_CLOSE_FAILED']);
  assert.equal(fs.existsSync(scratch.directory), false);
});

test('cleanup failure preserves the primary rejection and refuses an unowned recursive target', async () => {
  const {
    finalizeApplicationResult,
  } = require('../scripts/recovery/supabase-application-result.cjs');
  const report = await finalizeApplicationResult({
    result: null,
    code: 'LAB_APPLICATION_CONNECTED_IDENTITY_FAILED',
    app: {
      close: async () => {
        throw Error('synthetic close failure');
      },
    },
    scratch: {
      directory: os.tmpdir(),
      owner: '00000000-0000-4000-8000-000000000001',
    },
    cwd: process.cwd(),
  });
  assert.equal(report.verification, 'FAILED');
  assert.equal(report.code, 'LAB_APPLICATION_CONNECTED_IDENTITY_FAILED');
  assert.deepEqual(report.cleanupFailures, [
    'APP_CLOSE_FAILED',
    'SCRATCH_CLEANUP_FAILED',
  ]);
  assert.ok(fs.existsSync(os.tmpdir()));
});

test('structured application outcomes tolerate warning lines without interpreting stderr as the verdict', async () => {
  const {
    finalizeApplicationResult,
    readApplicationResult,
  } = require('../scripts/recovery/supabase-application-result.cjs');
  const rejection = await finalizeApplicationResult({
    result: null,
    code: 'LAB_APPLICATION_CONNECTED_IDENTITY_FAILED',
    cwd: process.cwd(),
  });
  assert.equal(
    readApplicationResult({
      status: 1,
      signal: null,
      stdout: JSON.stringify(rejection),
      stderr: '(node) synthetic warning\nother diagnostic\n',
    }).code,
    'LAB_APPLICATION_CONNECTED_IDENTITY_FAILED',
  );
  const success = await finalizeApplicationResult({
    result: verified,
    code: null,
    cwd: process.cwd(),
  });
  assert.equal(
    readApplicationResult({
      status: 0,
      signal: null,
      stdout: JSON.stringify(success),
      stderr: 'LAB_APPLICATION_CONNECTED_IDENTITY_FAILED\n',
    }).verification,
    'PASSED',
  );
});
