'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.resolve(__dirname, '../scripts/recovery/readiness.cjs');
const template = path.resolve(
  __dirname,
  '../docs/examples/recovery-readiness.pending.json',
);

function completeRecord() {
  const record = JSON.parse(fs.readFileSync(template, 'utf8'));
  for (const [section, fields] of Object.entries(record)) {
    if (typeof fields !== 'object') continue;
    for (const field of Object.keys(fields))
      fields[field] = `synthetic-${section}-${field}`.toLowerCase();
  }
  record.release = {
    backendCommit: 'a'.repeat(40),
    frontendCommit: 'b'.repeat(40),
  };
  Object.assign(record.approval, record.release, {
    confirmedOn: '2026-11-01',
    reviewBy: '2099-12-31',
  });
  Object.assign(record.policy, {
    captureIntervalHours: 24,
    recoveryPointObjectiveHours: 24,
    retainedCheckpoints: 7,
  });
  Object.assign(record.capacity, {
    measuredOn: '2026-11-01',
    reviewBy: '2099-12-31',
    checkpointBytes: 100,
    destinationAvailableBytes: 900,
    destinationReserveBytes: 50,
    stagingRequiredBytes: 200,
    stagingAvailableBytes: 300,
    transferRequiredBytes: 100,
    transferAvailableBytes: 200,
    runnerRequiredSeconds: 60,
    runnerAvailableSeconds: 120,
  });
  return record;
}

function run(record, { raw, extraArgs = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'biosphere-readiness-'));
  const file = path.join(root, 'record.json');
  try {
    fs.writeFileSync(file, raw ?? JSON.stringify(record));
    const env = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        ['systemroot', 'windir', 'comspec', 'temp', 'tmp'].includes(
          key.toLowerCase(),
        ),
      ),
    );
    return spawnSync(
      process.execPath,
      [cli, 'check', '--record', file, ...extraArgs],
      {
        env,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 10000,
      },
    );
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(root);
  }
}

test('pending decisions block planning readiness without granting deployment permission', () => {
  const child = run(JSON.parse(fs.readFileSync(template, 'utf8')));
  assert.equal(child.stderr, '');
  assert.equal(child.status, 1);
  const result = JSON.parse(child.stdout);
  assert.equal(result.code, 'READINESS_BLOCKED');
  assert.equal(result.deploymentAuthorized, false);
  assert.ok(
    result.blockers.some((item) => item.field === 'destination.identityRef'),
  );
  assert.ok(
    result.blockers.some((item) => item.field === 'ownership.keyCustodyRef'),
  );
});

test('rejects connection details instead of accepting or echoing them as evidence references', () => {
  const record = JSON.parse(fs.readFileSync(template, 'utf8'));
  const sensitive =
    'https://synthetic-user:synthetic-secret@example.invalid/private';
  record.destination.identityRef = sensitive;
  const child = run(record);
  assert.equal(child.status, 2);
  assert.equal(JSON.parse(child.stdout).code, 'READINESS_RECORD_INVALID');
  assert.equal(child.stderr, '');
  assert.ok(!child.stdout.includes(sensitive));
});

test('a complete synthetic record is eligible only for manual review', () => {
  const child = run(completeRecord());
  assert.equal(child.status, 0);
  assert.equal(child.stderr, '');
  const result = JSON.parse(child.stdout);
  assert.equal(result.code, 'READY_FOR_MANUAL_REVIEW');
  assert.equal(result.deploymentAuthorized, false);
  assert.deepEqual(result.blockers, []);
});

test('expired approval blocks an otherwise complete record', () => {
  const record = completeRecord();
  record.approval.confirmedOn = '2000-01-01';
  record.approval.reviewBy = '2000-01-02';
  const child = run(record);
  assert.equal(child.status, 1);
  assert.ok(
    JSON.parse(child.stdout).blockers.some(
      (item) =>
        item.code === 'REVIEW_EXPIRED' && item.field === 'approval.reviewBy',
    ),
  );
});

test('approval for a different release cannot satisfy the requested release', () => {
  const record = completeRecord();
  record.approval.backendCommit = 'c'.repeat(40);
  const child = run(record);
  assert.equal(child.status, 1);
  assert.ok(
    JSON.parse(child.stdout).blockers.some(
      (item) =>
        item.code === 'APPROVAL_RELEASE_MISMATCH' &&
        item.field === 'approval.backendCommit',
    ),
  );
});

test('destination budget includes retained full copies, one incoming copy and the reserved space', () => {
  const record = completeRecord();
  record.capacity.destinationAvailableBytes = 849;
  const child = run(record);
  assert.equal(child.status, 1);
  const result = JSON.parse(child.stdout);
  assert.equal(result.requiredDestinationBytes, '850');
  assert.ok(
    result.blockers.some(
      (item) => item.code === 'DESTINATION_CAPACITY_INSUFFICIENT',
    ),
  );
});

test('declared staging, transfer and runner shortfalls each block readiness', async (t) => {
  for (const [field, value, code] of [
    ['stagingAvailableBytes', 199, 'STAGING_CAPACITY_INSUFFICIENT'],
    ['transferAvailableBytes', 99, 'TRANSFER_CAPACITY_INSUFFICIENT'],
    ['runnerAvailableSeconds', 59, 'RUNNER_CAPACITY_INSUFFICIENT'],
  ]) {
    await t.test(field, () => {
      const record = completeRecord();
      record.capacity[field] = value;
      const child = run(record);
      assert.equal(child.status, 1);
      assert.ok(
        JSON.parse(child.stdout).blockers.some((item) => item.code === code),
      );
    });
  }
});

test('same-source destination and a schedule longer than the RPO are blocked', () => {
  const record = completeRecord();
  record.destination.identityRef = record.ownership.sourceIdentityRef;
  record.policy.captureIntervalHours = 48;
  const child = run(record);
  assert.equal(child.status, 1);
  const codes = JSON.parse(child.stdout).blockers.map((item) => item.code);
  assert.ok(codes.includes('DESTINATION_EQUALS_SOURCE'));
  assert.ok(codes.includes('SCHEDULE_EXCEEDS_RPO'));
});

test('future approval and stale capacity evidence remain blocked', async (t) => {
  for (const [section, field, value, code] of [
    ['approval', 'confirmedOn', '2099-01-01', 'DATE_IN_FUTURE'],
    ['capacity', 'measuredOn', '2099-01-01', 'DATE_IN_FUTURE'],
    ['capacity', 'reviewBy', '2000-01-02', 'REVIEW_EXPIRED'],
    ['approval', 'reviewBy', '2000-01-02', 'DATE_RANGE_INVALID'],
  ]) {
    await t.test(`${section}.${field}`, () => {
      const record = completeRecord();
      record[section][field] = value;
      const child = run(record);
      assert.equal(child.status, 1);
      assert.ok(
        JSON.parse(child.stdout).blockers.some((item) => item.code === code),
      );
    });
  }
});

test('budget equality passes but large products retain integer precision', () => {
  const record = completeRecord();
  record.capacity.destinationAvailableBytes = 850;
  assert.equal(run(record).status, 0);
  record.capacity.checkpointBytes = Number.MAX_SAFE_INTEGER;
  record.capacity.destinationAvailableBytes = Number.MAX_SAFE_INTEGER;
  const child = run(record);
  assert.equal(child.status, 1);
  const result = JSON.parse(child.stdout);
  assert.equal(result.requiredDestinationBytes, '72057594037927978');
  assert.ok(
    result.blockers.some(
      (item) => item.code === 'DESTINATION_CAPACITY_INSUFFICIENT',
    ),
  );
});

test('malformed records fail with sanitized errors', async (t) => {
  const invalid = [
    [
      'unexpected root field',
      (record) => {
        record.privateSecret = 'synthetic-sensitive-canary';
      },
    ],
    [
      'unexpected nested field',
      (record) => {
        record.destination.password = 'synthetic-sensitive-canary';
      },
    ],
    [
      'impossible date',
      (record) => {
        record.approval.confirmedOn = '2026-02-30';
      },
    ],
    [
      'unsafe integer',
      (record) => {
        record.capacity.checkpointBytes = Number.MAX_SAFE_INTEGER + 1;
      },
    ],
    [
      'negative budget',
      (record) => {
        record.capacity.stagingAvailableBytes = -1;
      },
    ],
    [
      'fractional checkpoint count',
      (record) => {
        record.policy.retainedCheckpoints = 1.5;
      },
    ],
    [
      'fake pending reference',
      (record) => {
        record.ownership.keyCustodyRef = 'pending';
      },
    ],
    [
      'wrong format',
      (record) => {
        record.format = 'synthetic-sensitive-canary';
      },
    ],
  ];
  for (const [name, edit] of invalid) {
    await t.test(name, () => {
      const record = completeRecord();
      edit(record);
      const child = run(record);
      assert.equal(child.status, 2);
      assert.equal(JSON.parse(child.stdout).code, 'READINESS_RECORD_INVALID');
      assert.equal(child.stderr, '');
      assert.ok(!child.stdout.includes('synthetic-sensitive-canary'));
    });
  }
});

test('invalid and oversized files and unsupported enable flags are rejected', () => {
  const malformed = run(null, {
    raw: '{"secret":"synthetic-sensitive-canary",',
  });
  assert.equal(malformed.status, 2);
  assert.equal(JSON.parse(malformed.stdout).code, 'READINESS_INPUT_INVALID');
  assert.ok(!malformed.stdout.includes('synthetic-sensitive-canary'));
  const oversized = run(null, { raw: ' '.repeat(65537) });
  assert.equal(oversized.status, 2);
  assert.equal(JSON.parse(oversized.stdout).code, 'READINESS_INPUT_UNSAFE');
  const enable = run(completeRecord(), { extraArgs: ['--enable'] });
  assert.equal(enable.status, 2);
  assert.equal(JSON.parse(enable.stdout).code, 'READINESS_USAGE');
});
