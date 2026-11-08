'use strict';
// Executed only by the owned lab, with generated configuration on stdin.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const assert = require('node:assert/strict');
const { verifyBuild } = require('./worker-build.cjs');
const {
  createScratch,
  finalizeApplicationResult,
} = require('./supabase-application-result.cjs');
const {
  IDS,
  objects,
  APP_SETTINGS,
} = require('./supabase-biosphere-profile.cjs');
const {
  validateIdentity,
  verifyContainerIdentity,
  verifyConnectedIdentity,
} = require('./supabase-application-identity.cjs');
const root = path.resolve(__dirname, '../..');
let app;
let scratch;
let stage = 'configuration';
const permitted = new Set();
async function main() {
  let result = null,
    code = null;
  try {
    verifyBuild();
    const input = fs.readFileSync(0);
    assert.ok(input.length < 16384);
    const config = JSON.parse(input.toString());
    assert.equal(Object.keys(config).length, 7);
    validateIdentity(config.identity);
    const db = new URL(config.databaseUrl),
      api = new URL(config.supabaseUrl);
    for (const url of [db, api]) {
      assert.equal(url.hostname, '127.0.0.1');
      assert.ok(Number(url.port) > 1024);
      permitted.add(Number(url.port));
    }
    assert.equal(db.protocol, 'postgresql:');
    assert.equal(db.username, 'supabase_admin');
    assert.match(db.password, /^[a-f0-9]{48}$/);
    assert.equal(db.pathname, '/postgres');
    assert.equal(api.protocol, 'http:');
    assert.equal(api.pathname, '/');
    assert.equal(api.username + api.password + api.search + api.hash, '');
    assert.match(config.email, /^lab-[a-f0-9-]{36}@example\.invalid$/);
    assert.match(config.password, /^[a-zA-Z0-9_-]{32}$/);
    assert.notEqual(db.port, api.port);
    stage = 'target-identity';
    verifyContainerIdentity(config.identity, db, api);
    // Fail closed for all application TCP destinations except these owned,
    // fixed gateways and this process's ephemeral Nest listener.
    const connect = net.Socket.prototype.connect;
    net.Socket.prototype.connect = function (...args) {
      const first = Array.isArray(args[0]) ? args[0][0] : args[0];
      const options =
        typeof first === 'object' ? first : { port: first, host: args[1] };
      if (
        !options ||
        options.path ||
        options.host !== '127.0.0.1' ||
        !permitted.has(Number(options.port))
      )
        throw new Error('LAB_OUTBOUND_REFUSED');
      return Reflect.apply(connect, this, args);
    };
    const fetch = globalThis.fetch;
    globalThis.fetch = (url, options = {}) => {
      const parsed = new URL(
        typeof url === 'string' || url instanceof URL ? url : url.url,
      );
      if (
        parsed.protocol !== 'http:' ||
        parsed.hostname !== '127.0.0.1' ||
        !permitted.has(Number(parsed.port))
      )
        throw new Error('LAB_OUTBOUND_REFUSED');
      return fetch(url, { ...options, redirect: 'error' });
    };
    // ConfigModule resolves its default env-file path from this empty owned cwd.
    // All configuration is pinned; the source checkout's .env is never loaded.
    stage = 'scratch-create';
    scratch = createScratch();
    process.chdir(scratch.directory);
    Object.assign(process.env, APP_SETTINGS, {
      DATABASE_URL: config.databaseUrl,
      DIRECT_URL: config.databaseUrl,
      SUPABASE_URL: config.supabaseUrl,
      SUPABASE_SECRET_KEY: config.serviceKey,
      SUPABASE_ANON_KEY: config.anonKey,
    });
    stage = 'application-start';
    require('reflect-metadata');
    const { NestFactory } = require('@nestjs/core');
    const { ValidationPipe } = require('@nestjs/common');
    const { AppModule } = require(path.join(root, 'dist/app.module.js'));
    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    const { PrismaService } = require(
      path.join(root, 'dist/prisma/prisma.service.js'),
    );
    const prisma = app.get(PrismaService);
    stage = 'connected-identity';
    await verifyConnectedIdentity(prisma, config.identity);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    permitted.add(address.port);
    const base = `http://127.0.0.1:${address.port}`;
    const request = async (route, options = {}, status = 200) => {
      const result = await globalThis.fetch(base + route, {
        ...options,
        signal: AbortSignal.timeout(10000),
      });
      assert.equal(result.status, status, 'Unexpected protected API status');
      return result.json();
    };
    stage = 'application-authorization';
    await request(`/specimens/${IDS.specimen}`, {}, 401);
    stage = 'application-login';
    const login = await request(
      '/auth/login',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: config.email,
          password: config.password,
        }),
      },
      201,
    );
    assert.equal(typeof login.access_token, 'string');
    const headers = { Authorization: `Bearer ${login.access_token}` };
    stage = 'application-reads';
    const specimen = await request(`/specimens/${IDS.specimen}`, { headers });
    assert.equal(specimen.commonName, 'Synthetic Recovery Beetle');
    assert.equal(specimen.collectionId, IDS.collection);
    assert.equal(specimen.status, 'UNCATALOGED');
    const lot = await request(`/specimens/${IDS.specimen}/lots/${IDS.lot}`, {
      headers,
    });
    assert.equal(lot.quantity, 2);
    assert.equal(lot.storageUnitId, IDS.storage);
    const storage = await request(`/storage-locations/${IDS.storage}`, {
      headers,
    });
    assert.equal(storage.label, 'TEST - Recovery Cabinet');
    const audit = await request(`/audit-logs/${IDS.audit}`, { headers });
    assert.equal(audit.action, 'SYNTHETIC_RECOVERY_FIXTURE');
    const faq = await request('/faq/assistant/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'What is the synthetic recovery code?',
      }),
    });
    assert.equal(
      faq.answer.answer,
      'The synthetic recovery code is beetle-42.',
    );
    stage = 'application-signed-media';
    const media = await request(
      `/specimens/${IDS.specimen}/media/${IDS.media}/signed-url`,
      { headers },
    );
    const signed = new URL(media.signedUrl);
    assert.equal(signed.origin, api.origin);
    assert.ok(
      signed.pathname.startsWith('/storage/v1/object/sign/specimen-media/'),
    );
    const bytes = await globalThis.fetch(signed, {
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(bytes.status, 200);
    assert.ok(
      Buffer.from(await bytes.arrayBuffer()).equals(objects()[1].bytes),
    );
    await verifyConnectedIdentity(prisma, config.identity);
    verifyContainerIdentity(config.identity, db, api);
    result = {
      application: 'PROTECTED_HTTP_VERIFIED',
      applicationUnauthorized: 'DENIED',
      applicationMedia: 'SIGNED_BYTES_PRESERVED',
    };
  } catch {
    code = `LAB_APPLICATION_${stage.toUpperCase().replaceAll('-', '_')}_FAILED`;
  } finally {
    const report = await finalizeApplicationResult({
      result,
      code,
      app,
      scratch,
      cwd: root,
    });
    // Publish only after every cleanup attempt. Synchronous pipe output keeps
    // the known verdict intact even when a failed close leaves live handles.
    fs.writeSync(1, JSON.stringify(report) + '\n');
    if (report.code) fs.writeSync(2, report.code + '\n');
    process.exitCode =
      report.verification === 'PASSED' && report.cleanup === 'COMPLETE' ? 0 : 1;
    if (report.cleanup === 'FAILED') process.exit(1);
  }
}
void main().catch(() => {
  try {
    fs.writeSync(2, 'LAB_APPLICATION_REPORT_FAILED\n');
  } catch {
    /* A closed diagnostic pipe cannot provide a reliable report. */
  }
  process.exit(1);
});
