#!/usr/bin/env node
'use strict';
// Local evidence checklist only. Never imports the worker or grants deployment permission.
const fs = require('node:fs');
const path = require('node:path');
const FORMAT = 'biosphere-recovery-readiness-v1';
const MAX_BYTES = 64 * 1024;
const SCHEMA = {
  release: { backendCommit: 'commit', frontendCommit: 'commit' },
  approval: {
    recordRef: 'ref',
    approverRef: 'ref',
    confirmedOn: 'date',
    reviewBy: 'date',
    backendCommit: 'commit',
    frontendCommit: 'commit',
  },
  ownership: {
    sourceIdentityRef: 'ref',
    sourceOwnerRef: 'ref',
    accountCustodyRef: 'ref',
    keyCustodyRef: 'ref',
    recoveryAccessRef: 'ref',
    supportRouteRef: 'ref',
  },
  destination: {
    identityRef: 'ref',
    ownerRef: 'ref',
    independenceEvidenceRef: 'ref',
    readbackEvidenceRef: 'ref',
    keySeparationEvidenceRef: 'ref',
  },
  runner: {
    identityRef: 'ref',
    ownerRef: 'ref',
    leastPrivilegeEvidenceRef: 'ref',
  },
  policy: {
    captureIntervalHours: 'positive',
    recoveryPointObjectiveHours: 'positive',
    retainedCheckpoints: 'positive',
    policyEvidenceRef: 'ref',
  },
  capacity: {
    measuredOn: 'date',
    reviewBy: 'date',
    checkpointBytes: 'positive',
    destinationAvailableBytes: 'nonnegative',
    destinationReserveBytes: 'nonnegative',
    stagingRequiredBytes: 'positive',
    stagingAvailableBytes: 'nonnegative',
    transferRequiredBytes: 'positive',
    transferAvailableBytes: 'nonnegative',
    runnerRequiredSeconds: 'positive',
    runnerAvailableSeconds: 'nonnegative',
  },
  verification: {
    syntheticReviewRef: 'ref',
    intendedSourceRestoreRef: 'ref',
    writeCoordinationRef: 'ref',
    retentionSafetyRef: 'ref',
    missedRunDetectionRef: 'ref',
    historyReconciliationRef: 'ref',
    curatorHandoverRef: 'ref',
  },
};

function fail(code) {
  throw Object.assign(new Error(code), { safeCode: code });
}
function exact(value, keys) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function valid(value, type) {
  if (value === null) return true;
  if (type === 'positive' || type === 'nonnegative')
    return (
      Number.isSafeInteger(value) && value >= (type === 'positive' ? 1 : 0)
    );
  if (typeof value !== 'string') return false;
  if (type === 'commit') return /^[a-f0-9]{40}$/.test(value);
  if (type === 'date') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }
  return (
    /^[a-z0-9][a-z0-9._-]{0,79}$/.test(value) &&
    !/^(pending|none|unknown|todo)$/i.test(value)
  );
}
function readRecord(file) {
  // Refuse UNC and device paths before any filesystem call (including on POSIX).
  if (/^[\\/]{2}/.test(file) || file.includes('\0'))
    fail('READINESS_INPUT_UNSAFE');
  let fd;
  try {
    const target = path.resolve(file);
    const before = fs.lstatSync(target, { bigint: true });
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.size > BigInt(MAX_BYTES)
    )
      fail('READINESS_INPUT_UNSAFE');
    fd = fs.openSync(
      target,
      fs.constants.O_RDONLY |
        (fs.constants.O_NOFOLLOW ?? 0) |
        (fs.constants.O_NONBLOCK ?? 0),
    );
    const opened = fs.fstatSync(fd, { bigint: true });
    // Older Windows Node versions report an unknown path device as zero.
    // Compare known devices only; retain exact inode identity on every platform.
    const differentKnownDevice =
      before.dev !== 0n && opened.dev !== 0n && before.dev !== opened.dev;
    if (
      !opened.isFile() ||
      differentKnownDevice ||
      opened.ino !== before.ino ||
      opened.size > BigInt(MAX_BYTES)
    )
      fail('READINESS_INPUT_UNSAFE');
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = fs.readSync(fd, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > MAX_BYTES) fail('READINESS_INPUT_UNSAFE');
    return JSON.parse(bytes.subarray(0, length).toString('utf8'));
  } catch (error) {
    if (error.safeCode) throw error;
    fail('READINESS_INPUT_INVALID');
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function assess(record) {
  if (
    !exact(record, ['format', ...Object.keys(SCHEMA)]) ||
    record.format !== FORMAT
  )
    fail('READINESS_RECORD_INVALID');
  const blockers = [];
  for (const [section, fields] of Object.entries(SCHEMA)) {
    if (!exact(record[section], Object.keys(fields)))
      fail('READINESS_RECORD_INVALID');
    for (const [field, type] of Object.entries(fields)) {
      if (!valid(record[section][field], type))
        fail('READINESS_RECORD_INVALID');
      if (record[section][field] === null)
        blockers.push({
          code: 'DECISION_MISSING',
          field: `${section}.${field}`,
        });
    }
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const part = (type) => parts.find((item) => item.type === type).value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  for (const [section, start] of [
    ['approval', 'confirmedOn'],
    ['capacity', 'measuredOn'],
  ]) {
    const values = record[section];
    if (values[start] !== null && values[start] > today)
      blockers.push({ code: 'DATE_IN_FUTURE', field: `${section}.${start}` });
    if (values.reviewBy !== null && values.reviewBy < today)
      blockers.push({ code: 'REVIEW_EXPIRED', field: `${section}.reviewBy` });
    if (
      values[start] !== null &&
      values.reviewBy !== null &&
      values.reviewBy < values[start]
    )
      blockers.push({
        code: 'DATE_RANGE_INVALID',
        field: `${section}.reviewBy`,
      });
  }
  for (const field of ['backendCommit', 'frontendCommit']) {
    if (
      record.release[field] !== null &&
      record.approval[field] !== null &&
      record.release[field] !== record.approval[field]
    )
      blockers.push({
        code: 'APPROVAL_RELEASE_MISMATCH',
        field: `approval.${field}`,
      });
  }
  if (
    record.destination.identityRef !== null &&
    record.destination.identityRef === record.ownership.sourceIdentityRef
  )
    blockers.push({
      code: 'DESTINATION_EQUALS_SOURCE',
      field: 'destination.identityRef',
    });
  if (
    record.policy.captureIntervalHours !== null &&
    record.policy.recoveryPointObjectiveHours !== null &&
    record.policy.captureIntervalHours >
      record.policy.recoveryPointObjectiveHours
  )
    blockers.push({
      code: 'SCHEDULE_EXCEEDS_RPO',
      field: 'policy.captureIntervalHours',
    });
  const capacity = record.capacity;
  let requiredDestinationBytes = null;
  if (
    record.policy.retainedCheckpoints !== null &&
    capacity.checkpointBytes !== null &&
    capacity.destinationReserveBytes !== null
  ) {
    const required =
      BigInt(capacity.checkpointBytes) *
        (BigInt(record.policy.retainedCheckpoints) + 1n) +
      BigInt(capacity.destinationReserveBytes);
    requiredDestinationBytes = required.toString();
    if (
      capacity.destinationAvailableBytes !== null &&
      BigInt(capacity.destinationAvailableBytes) < required
    )
      blockers.push({
        code: 'DESTINATION_CAPACITY_INSUFFICIENT',
        field: 'capacity.destinationAvailableBytes',
      });
  }
  for (const [available, required, code] of [
    [
      'stagingAvailableBytes',
      'stagingRequiredBytes',
      'STAGING_CAPACITY_INSUFFICIENT',
    ],
    [
      'transferAvailableBytes',
      'transferRequiredBytes',
      'TRANSFER_CAPACITY_INSUFFICIENT',
    ],
    [
      'runnerAvailableSeconds',
      'runnerRequiredSeconds',
      'RUNNER_CAPACITY_INSUFFICIENT',
    ],
  ]) {
    if (
      capacity[available] !== null &&
      capacity[required] !== null &&
      capacity[available] < capacity[required]
    )
      blockers.push({ code, field: `capacity.${available}` });
  }
  return {
    format: 'biosphere-recovery-readiness-result-v1',
    code: blockers.length ? 'READINESS_BLOCKED' : 'READY_FOR_MANUAL_REVIEW',
    deploymentAuthorized: false,
    checkedOn: today,
    requiredDestinationBytes,
    blockers,
  };
}

function main() {
  try {
    const args = process.argv.slice(2);
    if (
      args.length !== 3 ||
      args[0] !== 'check' ||
      args[1] !== '--record' ||
      !args[2]
    )
      fail('READINESS_USAGE');
    const result = assess(readRecord(args[2]));
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.blockers.length ? 1 : 0;
  } catch (error) {
    process.stdout.write(
      JSON.stringify({
        format: 'biosphere-recovery-readiness-result-v1',
        code: error.safeCode ?? 'READINESS_INPUT_INVALID',
        deploymentAuthorized: false,
      }) + '\n',
    );
    process.exitCode = 2;
  }
}
if (require.main === module) main();
