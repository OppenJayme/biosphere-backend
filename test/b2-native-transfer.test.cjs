'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { Writable, Readable } = require('node:stream');
const { createHash } = require('node:crypto');
const store = require('../scripts/recovery/supabase-checkpoint-store.cjs');
const transfer = require('../scripts/recovery/b2-checkpoint-transfer.cjs');
const { requestB2 } = require('../scripts/recovery/b2-native-request.cjs');

function setup(t, mode = 'success') {
  const w = store.createWorkspace(),
    base = fs.realpathSync(os.tmpdir()),
    out = fs.mkdtempSync(path.join(base, 'biosphere-native-b2-'));
  fs.chmodSync(out, 0o700);
  t.after(() => {
    for (const response of responses) response.destroy();
    for (const client of clients) client.destroy();
    for (const [dir, prefix] of [
      [w.checkpointDir, 'biosphere-platform-checkpoints-'],
      [w.keyDir, 'biosphere-platform-keys-'],
      [out, 'biosphere-native-b2-'],
    ]) {
      const real = fs.realpathSync(dir);
      assert.equal(path.dirname(real), base);
      assert.ok(path.basename(real).startsWith(prefix));
      fs.rmSync(real, { recursive: true, force: true });
    }
  });
  const data = {
    payload: {
      format: 'biosphere-platform-fixture-v3',
      application: { profile: 'biosphere-full-v1' },
      sample: 'native transport synthetic content',
    },
    verification: { expected: 'synthetic verification' },
    source: {
      owner: '12345678-1234-4234-8234-123456789abc',
      ids: ['a', 'b', 'c', 'd', 'e'].map((x) => x.repeat(64)),
    },
  };
  const receipt = store.saveCheckpoint(w.checkpointDir, w.keyDir, data);
  const target = {
    accountId: 'native-account',
    bucketId: 'native-bucket',
    bucketName: 'native-bucket-test',
    runId: '12345678-1234-4234-8234-123456789abc',
    namePrefix: 'synthetic/retention-12345678-1234-4234-8234-123456789abc/',
  };
  const session = {
    accountId: target.accountId,
    authorizationToken: 'native-token-canary',
    applicationKeyExpirationTimestamp: Date.now() + 3600000,
    apiInfo: {
      storageApi: {
        apiUrl: 'https://api001.backblazeb2.com',
        downloadUrl: 'https://f001.backblazeb2.com',
        allowed: {
          buckets: [{ id: target.bucketId, name: target.bucketName }],
          namePrefix: target.namePrefix,
          capabilities: [
            'listBuckets',
            'readBucketRetentions',
            'readFileRetentions',
            'readFiles',
            'writeFiles',
            'writeFileRetentions',
          ],
        },
      },
    },
  };
  const clients = [],
    responses = [],
    calls = [],
    ended = new Set();
  let remote, info;
  const uploadUrl =
    'https://pod-001.backblaze.com/b2api/v4/b2_upload_file/native-bucket/cvt';
  const json = (x) => ({
    status: 200,
    headers: {},
    bytes: Buffer.from(JSON.stringify(x)),
  });
  function serve(url, options, body) {
    calls.push({ url: String(url), options, body: Buffer.from(body) });
    assert.equal(options.rejectUnauthorized, true);
    assert.equal(options.agent, false);
    assert.equal(options.maxHeaderSize, 16384);
    assert.ok(!('ca' in options));
    assert.ok(!('lookup' in options));
    assert.ok(!('servername' in options));
    if (options.method === 'POST')
      assert.equal(options.headers['Content-Length'], String(body.length));
    const u = new URL(url);
    if (u.pathname.endsWith('/b2_list_buckets'))
      return json({
        buckets: [
          {
            accountId: target.accountId,
            bucketId: target.bucketId,
            bucketName: target.bucketName,
            bucketType: 'allPrivate',
            lifecycleRules: [],
            fileLockConfiguration: {
              isClientAuthorizedToRead: true,
              value: {
                isFileLockEnabled: true,
                defaultRetention: { mode: null, period: null },
              },
            },
          },
        ],
      });
    if (u.pathname.endsWith('/b2_get_upload_url'))
      return json({
        bucketId: target.bucketId,
        uploadUrl,
        authorizationToken: 'native-upload-token-canary',
      });
    if (String(url) === uploadUrl) {
      remote = Buffer.from(body);
      assert.equal(options.headers.Authorization, 'native-upload-token-canary');
      assert.equal(
        options.headers['X-Bz-File-Name'],
        target.namePrefix + 'checkpoint-' + receipt.artifactId + '.bsp',
      );
      info = {
        accountId: target.accountId,
        bucketId: target.bucketId,
        fileId: 'native-version',
        fileName: options.headers['X-Bz-File-Name'],
        action: 'upload',
        contentLength: remote.length,
        contentSha1: createHash('sha1').update(remote).digest('hex'),
        fileRetention: {
          isClientAuthorizedToRead: true,
          value: {
            mode: 'governance',
            retainUntilTimestamp: Number(
              options.headers['X-Bz-File-Retention-Retain-Until-Timestamp'],
            ),
          },
        },
      };
      return json(info);
    }
    if (u.pathname.endsWith('/b2_get_file_info')) {
      assert.equal(JSON.parse(body).fileId, 'native-version');
      return json(info);
    }
    if (u.pathname.endsWith('/b2_download_file_by_id')) {
      assert.equal(u.search, '?fileId=native-version');
      return {
        status: 200,
        headers: { 'x-bz-file-id': 'native-version' },
        bytes: remote,
      };
    }
    throw Error('Unexpected mocked HTTPS destination');
  }
  t.mock.method(https, 'request', (url, options, callback) => {
    const chunks = [];
    const client = new Writable({
      autoDestroy: false,
      write(chunk, encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
      final(done) {
        queueMicrotask(() => {
          try {
            const result = serve(url, options, Buffer.concat(chunks));
            if (
              mode === 'stall-headers' &&
              new URL(url).pathname.endsWith('/b2_list_buckets')
            )
              return;
            if (
              mode === 'closed-before-headers' &&
              new URL(url).pathname.endsWith('/b2_list_buckets')
            ) {
              client.destroy();
              return;
            }
            if (
              (mode === 'upload-error' || mode === 'upload-stall') &&
              String(url) === uploadUrl
            ) {
              if (mode === 'upload-error')
                client.destroy(Error('native-token-canary'));
              return;
            }
            if (new URL(url).pathname.endsWith('/b2_list_buckets')) {
              if (mode === 'oversized-advertised')
                result.headers['content-length'] = '65537';
              if (mode === 'oversized-stream')
                result.bytes = Buffer.concat([
                  result.bytes,
                  Buffer.alloc(65536, 32),
                ]);
              if (mode === 'redirect') {
                result.status = 307;
                result.headers.location = 'https://example.invalid/collect';
              }
              if (mode === 'compressed')
                result.headers['content-encoding'] = 'gzip';
              if (mode === 'short-content')
                result.headers['content-length'] = String(
                  result.bytes.length + 1,
                );
              if (mode === 'duplicate-content-length')
                result.headers['content-length'] = ['1', '2'];
              if (mode === 'aborted') result.complete = false;
            }
            const drip =
              (mode === 'drip-download' && options.method === 'GET') ||
              mode === 'response-close';
            const response = drip
              ? new Readable({ read() {} })
              : Readable.from([
                  result.bytes.subarray(0, 17),
                  result.bytes.subarray(17),
                ]);
            response.statusCode = result.status;
            response.headers = result.headers;
            response.complete = drip ? false : (result.complete ?? true);
            responses.push(response);
            response.on('end', () => ended.add(response));
            callback(response);
            if (mode === 'response-close')
              queueMicrotask(() => response.destroy());
          } catch (error) {
            client.destroy(error);
          }
        });
        done();
      },
    });
    clients.push(client);
    return client;
  });
  return {
    ...w,
    out,
    data,
    target,
    session,
    clients,
    responses,
    calls,
    ended,
    options: {
      checkpointDir: w.checkpointDir,
      keyDir: w.keyDir,
      target,
      session,
      request: requestB2,
    },
    setMode(value) {
      mode = value;
    },
    remote: () => remote,
  };
}

test('the real transfer engine completes a streamed round trip through the native HTTPS adapter', async (t) => {
  const f = setup(t);
  assert.equal(
    (await transfer.publishCheckpoint(f.options)).code,
    'B2_CHECKPOINT_PUBLISHED',
  );
  fs.unlinkSync(path.join(f.checkpointDir, 'checkpoint.bsp'));
  fs.unlinkSync(path.join(f.checkpointDir, 'checkpoint.json'));
  const destination = path.join(f.out, 'recovered');
  assert.equal(
    (await transfer.recoverCheckpoint({ ...f.options, destination })).code,
    'B2_CHECKPOINT_RECOVERED',
  );
  assert.deepEqual(
    store.loadCheckpoint(destination, f.keyDir).payload,
    f.data.payload,
  );
  assert.equal(
    f.calls.filter((r) => r.url.includes('/b2_upload_file/')).length,
    1,
  );
  assert.equal(f.calls.filter((r) => r.options.method === 'GET').length, 2);
});

test('advertised and streamed oversized metadata are rejected by the adapter', async (t) => {
  for (const mode of ['oversized-advertised', 'oversized-stream'])
    await t.test(mode, async (t) => {
      const f = setup(t, mode);
      await assert.rejects(transfer.publishCheckpoint(f.options), {
        code: 'B2_TRANSFER_HTTP_FAILED',
        uploadMayExist: false,
      });
      assert.equal(f.calls.length, 1);
      assert.equal(f.responses[0].destroyed, true);
      if (mode === 'oversized-advertised')
        assert.equal(f.ended.has(f.responses[0]), false);
      assert.ok(
        !fs.existsSync(path.join(f.keyDir, 'b2-transfer.private.json')),
      );
    });
});

test('redirects, compressed or incomplete responses never become successful publications', async (t) => {
  for (const mode of [
    'redirect',
    'compressed',
    'short-content',
    'duplicate-content-length',
    'aborted',
  ])
    await t.test(mode, async (t) => {
      const f = setup(t, mode);
      await assert.rejects(transfer.publishCheckpoint(f.options), {
        code: 'B2_TRANSFER_HTTP_FAILED',
        uploadMayExist: false,
      });
      assert.equal(f.calls.length, 1);
      assert.ok(
        !fs.existsSync(path.join(f.keyDir, 'b2-transfer.private.json')),
      );
      if (mode === 'redirect' || mode === 'compressed')
        assert.equal(f.ended.has(f.responses[0]), false);
    });
});

test('the absolute deadline destroys a request that never receives headers', async (t) => {
  const f = setup(t, 'stall-headers');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = transfer.publishCheckpoint(f.options);
  pending.catch(() => {});
  await new Promise(setImmediate);
  assert.equal(f.clients.length, 1);
  assert.equal(f.clients[0].destroyed, false);
  t.mock.timers.tick(20001);
  await new Promise(setImmediate);
  assert.equal(f.clients[0].destroyed, true);
  await assert.rejects(pending, {
    code: 'B2_TRANSFER_HTTP_FAILED',
    uploadMayExist: false,
  });
  assert.equal(f.calls.length, 1);
});

test('a response that keeps dripping bytes cannot extend the absolute deadline', async (t) => {
  const f = setup(t);
  await transfer.publishCheckpoint(f.options);
  f.setMode('drip-download');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = transfer.recoverCheckpoint({
    ...f.options,
    destination: path.join(f.out, 'timed-out'),
  });
  pending.catch(() => {});
  await new Promise(setImmediate);
  const response = f.responses.at(-1),
    client = f.clients.at(-1);
  for (let i = 0; i < 3; i++) {
    t.mock.timers.tick(5000);
    response.push(Buffer.from([i]));
    await new Promise(setImmediate);
    assert.equal(client.destroyed, false);
  }
  t.mock.timers.tick(5001);
  await new Promise(setImmediate);
  assert.equal(client.destroyed, true);
  assert.equal(response.destroyed, true);
  await assert.rejects(pending, { code: 'B2_TRANSFER_HTTP_FAILED' });
  assert.ok(!fs.existsSync(path.join(f.out, 'timed-out')));
});

test('a closed request or response settles the workflow immediately without waiting for a deadline', async (t) => {
  for (const mode of ['closed-before-headers', 'response-close'])
    await t.test(mode, async (t) => {
      const f = setup(t, mode);
      let outcome;
      const pending = transfer.publishCheckpoint(f.options);
      pending.catch((e) => {
        outcome = e;
      });
      await new Promise(setImmediate);
      assert.equal(outcome?.code, 'B2_TRANSFER_HTTP_FAILED');
      assert.equal(outcome.uploadMayExist, false);
      await assert.rejects(pending, { code: 'B2_TRANSFER_HTTP_FAILED' });
      assert.equal(f.calls.length, 1);
    });
});

test('an upload connection error after mocked commit is retained without retry or secret disclosure', async (t) => {
  const f = setup(t, 'upload-error');
  await assert.rejects(
    transfer.publishCheckpoint(f.options),
    (e) =>
      e.code === 'B2_TRANSFER_HTTP_FAILED' &&
      e.uploadMayExist === true &&
      !String(e).includes('native-token-canary'),
  );
  assert.ok(f.remote());
  const count = f.calls.length;
  await assert.rejects(transfer.publishCheckpoint(f.options), {
    code: 'B2_TRANSFER_ALREADY_ATTEMPTED',
    uploadMayExist: true,
  });
  assert.equal(f.calls.length, count);
  assert.equal(
    f.calls.filter((r) => r.url.includes('/b2_upload_file/')).length,
    1,
  );
});

test('an upload timeout after mocked commit also prevents a second upload', async (t) => {
  const f = setup(t, 'upload-stall');
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = transfer.publishCheckpoint(f.options);
  pending.catch(() => {});
  await new Promise(setImmediate);
  assert.ok(f.remote());
  t.mock.timers.tick(20001);
  await new Promise(setImmediate);
  await assert.rejects(pending, {
    code: 'B2_TRANSFER_HTTP_FAILED',
    uploadMayExist: true,
  });
  const count = f.calls.length;
  await assert.rejects(transfer.publishCheckpoint(f.options), {
    code: 'B2_TRANSFER_ALREADY_ATTEMPTED',
    uploadMayExist: true,
  });
  assert.equal(f.calls.length, count);
});

test('unsafe adapter overrides are rejected before the native request boundary', async (t) => {
  const cases = [
    [
      'foreign host',
      (o) => ({
        ...o,
        url: 'https://example.invalid/b2api/v4/b2_list_buckets',
      }),
    ],
    ['plain HTTP', (o) => ({ ...o, url: o.url.replace('https:', 'http:') })],
    [
      'delete operation',
      (o) => ({
        ...o,
        url: 'https://api001.backblazeb2.com/b2api/v4/b2_delete_file_version',
      }),
    ],
    [
      'host header',
      (o) => ({ ...o, headers: { ...o.headers, Host: 'example.invalid' } }),
    ],
    [
      'duplicate authorization',
      (o) => ({
        ...o,
        headers: { ...o.headers, authorization: 'native-token-canary' },
      }),
    ],
    [
      'header injection',
      (o) => ({
        ...o,
        headers: {
          ...o.headers,
          Authorization: 'native-token-canary\r\nX-Test: value',
        },
      }),
    ],
    ['TLS bypass', (o) => ({ ...o, rejectUnauthorized: false })],
    ['custom CA', (o) => ({ ...o, ca: 'synthetic CA' })],
    ['redirect follow', (o) => ({ ...o, followRedirects: true })],
    ['zero timeout', (o) => ({ ...o, timeoutMs: 0 })],
    [
      'excessive body budget',
      (o) => ({ ...o, maxResponseBytes: 64 * 1024 ** 2 + 1 }),
    ],
  ];
  for (const [name, mutate] of cases)
    await t.test(name, async (t) => {
      const f = setup(t);
      await assert.rejects(
        transfer.publishCheckpoint({
          ...f.options,
          request: (o) => requestB2(mutate(o)),
        }),
        { code: 'B2_TRANSFER_HTTP_FAILED', uploadMayExist: false },
      );
      assert.equal(f.clients.length, 0);
      assert.equal(f.calls.length, 0);
    });
});

test('changing caller budgets after dispatch cannot enlarge the validated response cap', async (t) => {
  const f = setup(t, 'oversized-stream');
  await assert.rejects(
    transfer.publishCheckpoint({
      ...f.options,
      request: (o) => {
        const pending = requestB2(o);
        o.maxResponseBytes = 1024 * 1024;
        return pending;
      },
    }),
    { code: 'B2_TRANSFER_HTTP_FAILED', uploadMayExist: false },
  );
  assert.equal(f.calls.length, 1);
});
