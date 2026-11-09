'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const store = require('../scripts/recovery/supabase-checkpoint-store.cjs');
const transfer = require('../scripts/recovery/b2-checkpoint-transfer.cjs');

function fixture(t) {
  const workspace = store.createWorkspace();
  const base = fs.realpathSync(os.tmpdir());
  const output = fs.mkdtempSync(path.join(base, 'biosphere-b2-roundtrip-'));
  fs.chmodSync(output, 0o700);
  t.after(() => {
    for (const [root, prefix] of [
      [workspace.checkpointDir, 'biosphere-platform-checkpoints-'],
      [workspace.keyDir, 'biosphere-platform-keys-'],
      [output, 'biosphere-b2-roundtrip-'],
    ]) {
      const real = fs.realpathSync(root);
      assert.equal(path.dirname(real), base);
      assert.ok(path.basename(real).startsWith(prefix));
      fs.rmSync(real, { recursive: true, force: true });
    }
  });
  const data = {
    payload: {
      format: 'biosphere-platform-fixture-v3',
      application: { profile: 'biosphere-full-v1' },
      example: 'SYNTHETIC PLAINTEXT MUST NOT BE UPLOADED',
    },
    verification: { expected: 'synthetic proof, kept separately' },
    source: {
      owner: '12345678-1234-4234-8234-123456789abc',
      ids: ['a', 'b', 'c', 'd', 'e'].map((c) => c.repeat(64)),
    },
  };
  const receipt = store.saveCheckpoint(
    workspace.checkpointDir,
    workspace.keyDir,
    data,
  );
  const target = {
    accountId: 'synthetic-account',
    bucketId: 'synthetic-bucket',
    bucketName: 'synthetic-test-bucket',
    runId: '12345678-1234-4234-8234-123456789abc',
    namePrefix: 'synthetic/retention-12345678-1234-4234-8234-123456789abc/',
  };
  const session = {
    accountId: target.accountId,
    authorizationToken: 'synthetic-token-canary',
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
  const requests = [];
  let saved, info;
  const uploadUrl =
    'https://pod-001.backblaze.com/b2api/v4/b2_upload_file?cvt=synthetic&bucket=synthetic-bucket';
  async function request(req) {
    requests.push({
      ...req,
      body: Buffer.isBuffer(req.body) ? Buffer.from(req.body) : req.body,
    });
    const json = (data) => ({
      status: 200,
      headers: {},
      body: Buffer.from(JSON.stringify(data)),
    });
    if (req.url.endsWith('/b2_list_buckets'))
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
    if (req.url.endsWith('/b2_get_upload_url'))
      return json({
        bucketId: target.bucketId,
        uploadUrl,
        authorizationToken: 'synthetic-upload-token-canary',
      });
    if (req.url === uploadUrl) {
      saved = Buffer.from(req.body);
      assert.ok(!saved.includes(Buffer.from('SYNTHETIC PLAINTEXT')));
      assert.equal(req.headers['Content-Type'], 'application/octet-stream');
      assert.equal(req.headers['Content-Length'], String(saved.length));
      assert.equal(req.headers.Authorization, 'synthetic-upload-token-canary');
      assert.equal(
        req.headers['X-Bz-Content-Sha1'],
        crypto.createHash('sha1').update(saved).digest('hex'),
      );
      assert.equal(req.headers['X-Bz-File-Retention-Mode'], 'governance');
      const remaining =
        Number(req.headers['X-Bz-File-Retention-Retain-Until-Timestamp']) -
        Date.now();
      assert.ok(remaining > 86350000 && remaining <= 86400000);
      assert.ok(!('X-Bz-File-Legal-Hold' in req.headers));
      assert.ok(!('X-Bz-Bypass-Governance' in req.headers));
      assert.equal(
        req.headers['X-Bz-File-Name'],
        target.namePrefix + 'checkpoint-' + receipt.artifactId + '.bsp',
      );
      info = {
        accountId: target.accountId,
        bucketId: target.bucketId,
        fileId: 'synthetic-version-1',
        fileName: req.headers['X-Bz-File-Name'],
        action: 'upload',
        contentLength: saved.length,
        contentSha1: crypto.createHash('sha1').update(saved).digest('hex'),
        fileRetention: {
          isClientAuthorizedToRead: true,
          value: {
            mode: 'governance',
            retainUntilTimestamp: Number(
              req.headers['X-Bz-File-Retention-Retain-Until-Timestamp'],
            ),
          },
        },
      };
      return json(info);
    }
    if (req.url.endsWith('/b2_get_file_info')) {
      assert.equal(JSON.parse(req.body).fileId, 'synthetic-version-1');
      return json(info);
    }
    if (
      req.url ===
      'https://f001.backblazeb2.com/b2api/v4/b2_download_file_by_id?fileId=synthetic-version-1'
    )
      return {
        status: 200,
        headers: { 'x-bz-file-id': ['synthetic-version-1'] },
        body: Buffer.from(saved),
      };
    throw Error('Unexpected synthetic HTTP request');
  }
  return {
    ...workspace,
    output,
    data,
    receipt,
    target,
    session,
    requests,
    request,
    remote: () => saved,
  };
}

test('an encrypted checkpoint survives publish, source-file loss and exact-version recovery', async (t) => {
  const f = fixture(t);
  const result = await transfer.publishCheckpoint({
    checkpointDir: f.checkpointDir,
    keyDir: f.keyDir,
    target: f.target,
    session: f.session,
    request: f.request,
  });
  assert.equal(result.code, 'B2_CHECKPOINT_PUBLISHED');
  assert.equal(result.deploymentAuthorized, false);
  const requestsAtPublish = f.requests.length;
  const upload = f.requests.filter(
    (r) => r.method === 'POST' && r.url.includes('/b2_upload_file'),
  );
  assert.equal(upload.length, 1);
  assert.ok(
    upload[0].body.equals(
      fs.readFileSync(path.join(f.checkpointDir, 'checkpoint.bsp')),
    ),
  );
  for (const secretFile of [
    'recovery.key',
    'recovery-verification.private.json',
  ]) {
    const secret = fs.readFileSync(path.join(f.keyDir, secretFile));
    assert.ok(!upload[0].body.includes(secret));
  }
  fs.unlinkSync(path.join(f.checkpointDir, 'checkpoint.bsp'));
  fs.unlinkSync(path.join(f.checkpointDir, 'checkpoint.json'));
  const destination = path.join(f.output, 'recovered');
  const recovery = await transfer.recoverCheckpoint({
    keyDir: f.keyDir,
    target: f.target,
    session: f.session,
    request: f.request,
    destination,
  });
  assert.equal(recovery.code, 'B2_CHECKPOINT_RECOVERED');
  assert.deepEqual(
    store.loadCheckpoint(destination, f.keyDir).payload,
    f.data.payload,
  );
  assert.deepEqual(
    store.loadCheckpoint(destination, f.keyDir).verification,
    f.data.verification,
  );
  assert.ok(
    f.requests
      .slice(requestsAtPublish)
      .every(
        (r) =>
          r.method === 'GET' ||
          r.url.endsWith('/b2_get_file_info') ||
          r.url.endsWith('/b2_list_buckets'),
      ),
  );
  assert.equal(
    f.requests.filter((r) => r.url.includes('/b2_upload_file')).length,
    1,
  );
});

test('a committed upload with a lost response is retained and cannot be uploaded again', async (t) => {
  const f = fixture(t);
  const options = {
    checkpointDir: f.checkpointDir,
    keyDir: f.keyDir,
    target: f.target,
    session: f.session,
    request: async (req) => {
      const response = await f.request(req);
      if (req.url.includes('/b2_upload_file'))
        throw Error('synthetic-token-canary');
      return response;
    },
  };
  await assert.rejects(transfer.publishCheckpoint(options), {
    code: 'B2_TRANSFER_HTTP_FAILED',
    uploadMayExist: true,
  });
  const count = f.requests.length;
  await assert.rejects(
    transfer.publishCheckpoint({ ...options, request: f.request }),
    { code: 'B2_TRANSFER_ALREADY_ATTEMPTED', uploadMayExist: true },
  );
  await assert.rejects(
    transfer.recoverCheckpoint({
      ...options,
      request: f.request,
      destination: path.join(f.output, 'recovered'),
    }),
    { code: 'B2_TRANSFER_UPLOAD_UNRESOLVED' },
  );
  assert.equal(f.requests.length, count);
  assert.equal(
    f.requests.filter((r) => r.url.includes('/b2_upload_file')).length,
    1,
  );
  assert.ok(f.remote());
});

test('an upload-URL failure permits an explicit retry without changing source or recovery material', async (t) => {
  const f = fixture(t),
    key = fs.readFileSync(path.join(f.keyDir, 'recovery.key'));
  const options = {
    checkpointDir: f.checkpointDir,
    keyDir: f.keyDir,
    target: f.target,
    session: f.session,
  };
  await assert.rejects(
    transfer.publishCheckpoint({
      ...options,
      request: async (req) => {
        if (req.url.endsWith('/b2_get_upload_url'))
          throw Error('synthetic-token-canary');
        return f.request(req);
      },
    }),
    { code: 'B2_TRANSFER_HTTP_FAILED', uploadMayExist: false },
  );
  assert.ok(!fs.existsSync(path.join(f.keyDir, 'b2-transfer.private.json')));
  const result = await transfer.publishCheckpoint({
    ...options,
    request: f.request,
  });
  assert.equal(result.code, 'B2_CHECKPOINT_PUBLISHED');
  assert.ok(key.equals(fs.readFileSync(path.join(f.keyDir, 'recovery.key'))));
  assert.equal(
    f.requests.filter((r) => r.url.includes('/b2_upload_file')).length,
    1,
  );
});

test('extra target fields cannot copy credentials into the private transfer receipt', async (t) => {
  const f = fixture(t);
  f.target.secret = 'synthetic-token-canary';
  await assert.rejects(
    transfer.publishCheckpoint({
      checkpointDir: f.checkpointDir,
      keyDir: f.keyDir,
      target: f.target,
      session: f.session,
      request: f.request,
    }),
    { code: 'B2_TRANSFER_INVALID' },
  );
  assert.equal(f.requests.length, 0);
  assert.ok(!fs.existsSync(path.join(f.keyDir, 'b2-transfer.private.json')));
});

test('a read-only recovery session downloads corrupted bytes without creating a completed target', async (t) => {
  const f = fixture(t),
    options = {
      checkpointDir: f.checkpointDir,
      keyDir: f.keyDir,
      target: f.target,
      session: f.session,
      request: f.request,
    };
  await transfer.publishCheckpoint(options);
  const reader = structuredClone(f.session);
  reader.apiInfo.storageApi.allowed.capabilities = [
    'listBuckets',
    'readBucketRetentions',
    'readFileRetentions',
    'readFiles',
  ];
  const count = f.requests.length,
    destination = path.join(f.output, 'corrupt');
  await assert.rejects(
    transfer.recoverCheckpoint({
      ...options,
      session: reader,
      destination,
      request: async (req) => {
        const r = await f.request(req);
        if (req.method === 'GET') r.body[40] ^= 1;
        return r;
      },
    }),
    { code: 'B2_TRANSFER_HASH_MISMATCH' },
  );
  assert.ok(!fs.existsSync(destination));
  assert.ok(
    f.requests.slice(count).every((r) => !r.url.includes('/b2_upload_file')),
  );
  assert.equal(
    (
      await transfer.recoverCheckpoint({
        ...options,
        session: reader,
        destination,
      })
    ).code,
    'B2_CHECKPOINT_RECOVERED',
  );
});

test('authenticated transfer metadata rejects a changed version or wrong recovery key before HTTP', async (t) => {
  for (const mutation of ['receipt', 'key'])
    await t.test(mutation, async (t) => {
      const f = fixture(t),
        options = {
          checkpointDir: f.checkpointDir,
          keyDir: f.keyDir,
          target: f.target,
          session: f.session,
          request: f.request,
        };
      await transfer.publishCheckpoint(options);
      const count = f.requests.length;
      if (mutation === 'receipt') {
        const file = path.join(f.keyDir, 'b2-transfer.private.json');
        const content = JSON.parse(fs.readFileSync(file));
        content.fileId = 'other-version';
        fs.writeFileSync(file, JSON.stringify(content));
      } else
        fs.writeFileSync(
          path.join(f.keyDir, 'recovery.key'),
          crypto.randomBytes(32),
        );
      await assert.rejects(
        transfer.recoverCheckpoint({
          ...options,
          destination: path.join(f.output, 'recovered'),
        }),
        { code: 'B2_TRANSFER_RECEIPT_AUTHENTICATION_FAILED' },
      );
      assert.equal(f.requests.length, count);
    });
});

test('missing private verification material leaves the recovery target locked and never reports success', async (t) => {
  const f = fixture(t),
    options = {
      checkpointDir: f.checkpointDir,
      keyDir: f.keyDir,
      target: f.target,
      session: f.session,
      request: f.request,
    };
  await transfer.publishCheckpoint(options);
  fs.unlinkSync(path.join(f.keyDir, 'recovery-verification.private.json'));
  const destination = path.join(f.output, 'incomplete');
  await assert.rejects(
    transfer.recoverCheckpoint({ ...options, destination }),
    { code: 'CHECKPOINT_VERIFICATION_MISSING' },
  );
  assert.ok(fs.existsSync(path.join(destination, '.capture.lock')));
  assert.ok(!fs.existsSync(path.join(destination, 'checkpoint.json')));
  await assert.rejects(
    transfer.recoverCheckpoint({ ...options, destination }),
    { code: 'B2_TRANSFER_TARGET_EXISTS' },
  );
});

test('an existing recovery destination is preserved and no HTTP request is sent', async (t) => {
  const f = fixture(t),
    options = {
      checkpointDir: f.checkpointDir,
      keyDir: f.keyDir,
      target: f.target,
      session: f.session,
      request: f.request,
    };
  await transfer.publishCheckpoint(options);
  const count = f.requests.length,
    destination = path.join(f.output, 'existing');
  fs.mkdirSync(destination);
  fs.writeFileSync(path.join(destination, 'keep.txt'), 'do not overwrite');
  await assert.rejects(
    transfer.recoverCheckpoint({ ...options, destination }),
    { code: 'B2_TRANSFER_TARGET_EXISTS' },
  );
  assert.equal(
    fs.readFileSync(path.join(destination, 'keep.txt'), 'utf8'),
    'do not overwrite',
  );
  assert.equal(f.requests.length, count);
});

test('a bucket that became public is rejected before recovery download', async (t) => {
  const f = fixture(t),
    options = {
      checkpointDir: f.checkpointDir,
      keyDir: f.keyDir,
      target: f.target,
      session: f.session,
      request: f.request,
    };
  await transfer.publishCheckpoint(options);
  const count = f.requests.length;
  await assert.rejects(
    transfer.recoverCheckpoint({
      ...options,
      destination: path.join(f.output, 'recovered'),
      request: async (req) => {
        const r = await f.request(req);
        if (req.url.endsWith('/b2_list_buckets')) {
          const data = JSON.parse(r.body);
          data.buckets[0].bucketType = 'allPublic';
          r.body = Buffer.from(JSON.stringify(data));
        }
        return r;
      },
    }),
    { code: 'B2_TRANSFER_BUCKET_INVALID' },
  );
  assert.ok(
    f.requests.slice(count).every((r) => r.url.endsWith('/b2_list_buckets')),
  );
});

test('configuration changes while HTTP is pending cannot change the validated target', async (t) => {
  const f = fixture(t),
    target = { ...f.target };
  const result = await transfer.publishCheckpoint({
    checkpointDir: f.checkpointDir,
    keyDir: f.keyDir,
    target,
    session: f.session,
    request: async (req) => {
      const r = await f.request(req);
      if (req.url.endsWith('/b2_list_buckets'))
        target.bucketId = 'different-bucket';
      return r;
    },
  });
  assert.equal(result.code, 'B2_CHECKPOINT_PUBLISHED');
  assert.equal(
    f.requests.filter((r) => r.url.includes('/b2_upload_file')).length,
    1,
  );
});

test('invalid authorization scope or privileges stop before any HTTP or attempt receipt', async (t) => {
  for (const mutation of [
    'broad-capability',
    'wrong-prefix',
    'expired',
    'foreign-api',
    'missing-adapter',
  ])
    await t.test(mutation, async (t) => {
      const f = fixture(t),
        session = structuredClone(f.session);
      let request = f.request;
      if (mutation === 'broad-capability')
        session.apiInfo.storageApi.allowed.capabilities.push('deleteFiles');
      if (mutation === 'wrong-prefix')
        session.apiInfo.storageApi.allowed.namePrefix = '';
      if (mutation === 'expired') session.applicationKeyExpirationTimestamp = 1;
      if (mutation === 'foreign-api')
        session.apiInfo.storageApi.apiUrl = 'https://example.invalid';
      if (mutation === 'missing-adapter') request = undefined;
      await assert.rejects(
        transfer.publishCheckpoint({
          checkpointDir: f.checkpointDir,
          keyDir: f.keyDir,
          target: f.target,
          session,
          request,
        }),
        (error) =>
          error.code.startsWith('B2_TRANSFER_') &&
          error.uploadMayExist === false,
      );
      assert.equal(f.requests.length, 0);
      assert.ok(
        !fs.existsSync(path.join(f.keyDir, 'b2-transfer.private.json')),
      );
    });
});

test('a wrong-version download and a failed post-upload readback preserve recoverable evidence', async (t) => {
  const f = fixture(t),
    options = {
      checkpointDir: f.checkpointDir,
      keyDir: f.keyDir,
      target: f.target,
      session: f.session,
      request: f.request,
    };
  await assert.rejects(
    transfer.publishCheckpoint({
      ...options,
      request: async (req) => {
        const response = await f.request(req);
        if (req.method === 'GET')
          response.headers['x-bz-file-id'] = ['wrong-version'];
        return response;
      },
    }),
    { code: 'B2_TRANSFER_VERSION_INVALID', uploadMayExist: true },
  );
  const result = await transfer.recoverCheckpoint({
    ...options,
    destination: path.join(f.output, 'recovered'),
  });
  assert.equal(result.code, 'B2_CHECKPOINT_RECOVERED');
  assert.equal(
    f.requests.filter((r) => r.url.includes('/b2_upload_file')).length,
    1,
  );
  const receiptText = fs.readFileSync(
    path.join(f.keyDir, 'b2-transfer.private.json'),
    'utf8',
  );
  assert.ok(!receiptText.includes('synthetic-token-canary'));
  assert.ok(!receiptText.includes('synthetic-upload-token-canary'));
});

test('two publishers for one checkpoint reserve exactly one attempt and upload one object', async (t) => {
  const f = fixture(t),
    options = {
      checkpointDir: f.checkpointDir,
      keyDir: f.keyDir,
      target: f.target,
      session: f.session,
      request: f.request,
    };
  const results = await Promise.allSettled([
    transfer.publishCheckpoint(options),
    transfer.publishCheckpoint(options),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const loser = results.find((r) => r.status === 'rejected');
  assert.equal(loser.reason.code, 'B2_TRANSFER_ALREADY_ATTEMPTED');
  assert.equal(loser.reason.uploadMayExist, true);
  assert.equal(
    f.requests.filter((r) => r.url.includes('/b2_upload_file')).length,
    1,
  );
});

test('inode identity changes cannot be rounded away by numeric stat conversion', async (t) => {
  for (const seam of ['loader', 'transfer'])
    await t.test(seam, async (t) => {
      const f = fixture(t),
        original = fs.fstatSync;
      t.mock.method(fs, 'fstatSync', (...args) => {
        const stat = original(...args);
        stat.ino = typeof stat.ino === 'bigint' ? stat.ino + 1n : stat.ino + 1;
        return stat;
      });
      if (seam === 'loader')
        assert.throws(() => store.loadCheckpoint(f.checkpointDir, f.keyDir), {
          code: 'CHECKPOINT_FILE_CHANGED',
        });
      else
        await assert.rejects(
          transfer.publishCheckpoint({
            checkpointDir: f.checkpointDir,
            keyDir: f.keyDir,
            target: f.target,
            session: f.session,
            request: f.request,
          }),
          { code: 'B2_TRANSFER_FILE_CHANGED' },
        );
      assert.equal(f.requests.length, 0);
    });
});

test('two known but different device IDs are rejected on every platform', async (t) => {
  for (const seam of ['loader', 'transfer'])
    await t.test(seam, async (t) => {
      const f = fixture(t),
        lstat = fs.lstatSync,
        fstat = fs.fstatSync;
      t.mock.method(fs, 'lstatSync', (...args) => {
        const stat = lstat(...args);
        if (stat.isFile()) stat.dev = typeof stat.dev === 'bigint' ? 123n : 123;
        return stat;
      });
      t.mock.method(fs, 'fstatSync', (...args) => {
        const stat = fstat(...args);
        stat.dev = typeof stat.dev === 'bigint' ? 456n : 456;
        return stat;
      });
      if (seam === 'loader')
        assert.throws(() => store.loadCheckpoint(f.checkpointDir, f.keyDir), {
          code: 'CHECKPOINT_FILE_CHANGED',
        });
      else
        await assert.rejects(
          transfer.publishCheckpoint({
            checkpointDir: f.checkpointDir,
            keyDir: f.keyDir,
            target: f.target,
            session: f.session,
            request: f.request,
          }),
          { code: 'B2_TRANSFER_FILE_CHANGED' },
        );
      assert.equal(f.requests.length, 0);
    });
});

test('publication cannot report verified after its recovery material changes during HTTP', async (t) => {
  for (const material of ['key', 'proof'])
    await t.test(material, async (t) => {
      const f = fixture(t),
        options = {
          checkpointDir: f.checkpointDir,
          keyDir: f.keyDir,
          target: f.target,
          session: f.session,
        };
      await assert.rejects(
        transfer.publishCheckpoint({
          ...options,
          request: async (req) => {
            const r = await f.request(req);
            if (req.method === 'GET') {
              if (material === 'key')
                fs.writeFileSync(
                  path.join(f.keyDir, 'recovery.key'),
                  crypto.randomBytes(32),
                );
              else
                fs.writeFileSync(
                  path.join(f.keyDir, 'recovery-verification.private.json'),
                  '{"changed":true}',
                );
            }
            return r;
          },
        }),
        {
          code:
            material === 'key'
              ? 'CHECKPOINT_AUTHENTICATION_FAILED'
              : 'CHECKPOINT_VERIFICATION_CHANGED',
          uploadMayExist: true,
        },
      );
      assert.equal(
        JSON.parse(
          fs.readFileSync(path.join(f.keyDir, 'b2-transfer.private.json')),
        ).state,
        'uploaded',
      );
      assert.equal(
        f.requests.filter((r) => r.url.includes('/b2_upload_file')).length,
        1,
      );
    });
});
