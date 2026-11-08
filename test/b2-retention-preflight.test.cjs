'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.resolve(
  __dirname,
  '../scripts/recovery/b2-retention-preflight.cjs',
);
function metadata() {
  return {
    format: 'biosphere-b2-preflight-v1',
    authorization: {
      bucketRefs: ['synthetic-bucket'],
      namePrefix: 'synthetic/',
      capabilities: [
        'listBuckets',
        'readBucketRetentions',
        'readFileRetentions',
        'readFiles',
        'writeFiles',
      ],
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    },
    bucket: {
      bucketRef: 'synthetic-bucket',
      private: true,
      retentionReadable: true,
      objectLockEnabled: true,
      mode: 'governance',
      retentionDays: 1,
    },
  };
}
function run(record, args = ['check']) {
  const env = {};
  for (const key of ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME'])
    if (process.env[key]) env[key] = process.env[key];
  const result = spawnSync(process.execPath, [cli, ...args], {
    input: typeof record === 'string' ? record : JSON.stringify(record),
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 65536,
    env,
    windowsHide: true,
  });
  assert.ifError(result.error);
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout);
  assert.equal(output.providerVerified, false);
  assert.equal(output.deploymentAuthorized, false);
  return { status: result.status, output, raw: result.stdout };
}
test('disabled Object Lock blocks retention verification even with a restricted key', () => {
  const record = metadata();
  record.bucket.objectLockEnabled = false;
  const result = run(record);
  assert.equal(result.status, 1);
  assert.ok(result.output.blockers.includes('OBJECT_LOCK_DISABLED'));
});
test('a consistent synthetic proposal is for manual review, never provider verification', () => {
  const result = run(metadata());
  assert.equal(result.status, 0);
  assert.equal(result.output.code, 'B2_METADATA_CONSISTENT_FOR_MANUAL_REVIEW');
  assert.deepEqual(result.output.blockers, []);
});
test('the current console Read/Write preset is rejected as a routine publisher', () => {
  const record = metadata();
  record.authorization.capabilities.push('deleteFiles', 'writeBuckets');
  const result = run(record);
  assert.equal(result.status, 1);
  assert.ok(result.output.blockers.includes('EXCESS_KEY_CAPABILITIES'));
});
test('incomplete or contradictory retention/key proposals are blocked', async (t) => {
  const cases = [
    [
      'private access required',
      (r) => {
        r.bucket.private = false;
      },
      'BUCKET_NOT_PRIVATE',
    ],
    [
      'unreadable retention remains unknown',
      (r) => {
        r.bucket.retentionReadable = false;
      },
      'RETENTION_UNREADABLE',
    ],
    [
      'default retention missing',
      (r) => {
        r.bucket.mode = null;
      },
      'RETENTION_MODE_MISSING',
    ],
    [
      'one-day synthetic bound',
      (r) => {
        r.bucket.retentionDays = 30;
      },
      'TEST_RETENTION_OUT_OF_BOUNDS',
    ],
    [
      'wrong bucket',
      (r) => {
        r.authorization.bucketRefs = ['another-bucket'];
      },
      'BUCKET_MISMATCH',
    ],
    [
      'prefix too broad',
      (r) => {
        r.authorization.namePrefix = '';
      },
      'PREFIX_NOT_SYNTHETIC',
    ],
    [
      'missing readback permission',
      (r) => {
        r.authorization.capabilities = r.authorization.capabilities.filter(
          (c) => c !== 'readFiles',
        );
      },
      'MISSING_KEY_CAPABILITIES',
    ],
    [
      'expired key',
      (r) => {
        r.authorization.expiresAt = '2000-01-01T00:00:00.000Z';
      },
      'KEY_EXPIRY_OUT_OF_BOUNDS',
    ],
    [
      'long-lived key',
      (r) => {
        r.authorization.expiresAt = '2099-01-01T00:00:00.000Z';
      },
      'KEY_EXPIRY_OUT_OF_BOUNDS',
    ],
  ];
  for (const [name, change, code] of cases)
    await t.test(name, () => {
      const record = metadata();
      change(record);
      const result = run(record);
      assert.equal(result.status, 1);
      assert.ok(result.output.blockers.includes(code));
    });
});
test('malformed or secret-bearing records fail with sanitized output', async (t) => {
  const invalid = [
    [
      'unknown field',
      (r) => {
        r.applicationKey = 'private-value-canary-never-echo';
      },
    ],
    [
      'wrong format',
      (r) => {
        r.format = 'other-v1';
      },
    ],
    [
      'string boolean',
      (r) => {
        r.bucket.private = 'true';
      },
    ],
    [
      'duplicate capabilities',
      (r) => {
        r.authorization.capabilities.push('readFiles');
      },
    ],
    [
      'invalid date',
      (r) => {
        r.authorization.expiresAt = '2099-02-30T00:00:00.000Z';
      },
    ],
    [
      'URL instead of opaque reference',
      (r) => {
        r.authorization.bucketRefs = [
          'https://private.invalid/private-value-canary-never-echo',
        ];
      },
    ],
    [
      'missing authorization',
      (r) => {
        delete r.authorization;
      },
    ],
    [
      'unknown nested field',
      (r) => {
        r.bucket.privateKey = 'private-value-canary-never-echo';
      },
    ],
  ];
  for (const [name, change] of invalid)
    await t.test(name, () => {
      const record = metadata();
      change(record);
      const result = run(record);
      assert.equal(result.status, 2);
      assert.equal(result.output.code, 'B2_METADATA_INVALID');
      assert.ok(!result.raw.includes('private-value-canary-never-echo'));
    });
  for (const input of ['{broken', 'null', '[]', ' '.repeat(16385)]) {
    const result = run(input);
    assert.equal(result.status, 2);
  }
});
test('compliance metadata remains advisory and unsupported execution flags are rejected', () => {
  const record = metadata();
  record.bucket.mode = 'compliance';
  assert.equal(run(record).status, 0);
  for (const args of [
    [],
    ['enable'],
    ['check', '--apply'],
    ['check', '--record', 'private.env'],
  ])
    assert.equal(run(record, args).status, 2);
});
test('all-bucket and multi-bucket authorization cannot qualify as a restricted publisher', () => {
  for (const bucketRefs of [null, [], ['synthetic-bucket', 'another-bucket']]) {
    const record = metadata();
    delete record.authorization.bucketRef;
    record.authorization.bucketRefs = bucketRefs;
    const result = run(record);
    assert.equal(result.status, 1);
    assert.ok(result.output.blockers.includes('KEY_NOT_SINGLE_BUCKET'));
  }
});
