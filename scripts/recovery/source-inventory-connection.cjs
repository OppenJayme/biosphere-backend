#!/usr/bin/env node
'use strict';
// Explicit opt-in connection assembly; never loads dotenv or application config.
function fail(code = 'SOURCE_CONNECTION_CONFIGURATION_INVALID') {
  throw Object.assign(new Error(code), { safeCode: code });
}
function check(value, code) {
  if (!value) fail(code);
}
function configuration(project, environment) {
  for (const name of [
    'NODE_OPTIONS',
    'NODE_DEBUG',
    'NODE_DEBUG_NATIVE',
    'NODE_EXTRA_CA_CERTS',
    'NODE_TLS_REJECT_UNAUTHORIZED',
    'SSLKEYLOGFILE',
  ])
    check(!environment[name], 'SOURCE_CONNECTION_RUNTIME_UNSAFE');
  const url = new URL(environment.BIOSPHERE_INVENTORY_DATABASE_URL);
  check(
    ['postgresql:', 'postgres:'].includes(url.protocol) &&
      !url.search &&
      !url.hash &&
      (url.port === '' || url.port === '5432') &&
      url.pathname === '/postgres',
  );
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const direct =
    url.hostname === `db.${project}.supabase.co` &&
    /^[a-z_][a-z0-9_]{0,62}$/.test(user);
  const session =
    /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
    new RegExp(`^[a-z_][a-z0-9_]{0,62}\\.${project}$`).test(user);
  check(
    (direct || session) &&
      password.length > 0 &&
      password.length <= 4096 &&
      !/[\x00-\x1f\x7f]/.test(password),
  );
  const key = environment.BIOSPHERE_INVENTORY_STORAGE_API_KEY;
  const bearer = environment.BIOSPHERE_INVENTORY_STORAGE_BEARER;
  check(
    typeof key === 'string' &&
      /^[A-Za-z0-9._-]{16,4096}$/.test(key) &&
      typeof bearer === 'string' &&
      /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer) &&
      bearer.length <= 8192,
  );
  const ca = environment.BIOSPHERE_INVENTORY_DATABASE_CA_PEM;
  check(
    ca === undefined ||
      (typeof ca === 'string' &&
        ca.length <= 65536 &&
        ca.startsWith('-----BEGIN CERTIFICATE-----') &&
        !ca.includes('PRIVATE KEY')),
  );
  return {
    project,
    key,
    bearer,
    database: {
      host: url.hostname,
      port: 5432,
      database: 'postgres',
      user,
      password,
      ssl: {
        rejectUnauthorized: true,
        servername: url.hostname,
        ...(ca ? { ca } : {}),
      },
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      statement_timeout: 5000,
      lock_timeout: 1000,
      idle_in_transaction_session_timeout: 10000,
      options: '-c default_transaction_read_only=on',
      application_name: 'biosphere-read-only-inventory',
    },
  };
}
function storageAdapter(config, request) {
  const active = new Set();
  const states = new Map();
  let closed = false;
  async function json(method, path, body) {
    check(!closed, 'SOURCE_CONNECTION_CLOSED');
    return new Promise((resolve, reject) => {
      let req,
        timer,
        settled = false;
      const done = (error, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        active.delete(req);
        if (error) {
          req?.destroy();
          reject(error);
        } else resolve(value);
      };
      const error = (code) =>
        Object.assign(new Error(code), { safeCode: code });
      try {
        const encoded =
          body === undefined ? undefined : Buffer.from(JSON.stringify(body));
        req = request(
          {
            protocol: 'https:',
            hostname: `${config.project}.supabase.co`,
            port: 443,
            method,
            path,
            rejectUnauthorized: true,
            agent: false,
            headers: {
              apikey: config.key,
              Authorization: `Bearer ${config.bearer}`,
              Accept: 'application/json',
              ...(encoded
                ? {
                    'Content-Type': 'application/json',
                    'Content-Length': encoded.length,
                  }
                : {}),
            },
          },
          (response) => {
            if (response.statusCode !== 200) {
              response.resume();
              done(error('SOURCE_CONNECTION_HTTP_REJECTED'));
              return;
            }
            if (
              !/^application\/json(?:;|$)/i.test(
                response.headers['content-type'] ?? '',
              ) ||
              (response.headers['content-encoding'] &&
                response.headers['content-encoding'] !== 'identity')
            ) {
              response.resume();
              done(error('SOURCE_CONNECTION_RESPONSE_INVALID'));
              return;
            }
            const chunks = [];
            let size = 0;
            response.on('data', (chunk) => {
              size += chunk.length;
              if (size > 2 * 1024 ** 2)
                done(error('SOURCE_CONNECTION_RESPONSE_TOO_LARGE'));
              else chunks.push(chunk);
            });
            response.on('aborted', () =>
              done(error('SOURCE_CONNECTION_RESPONSE_INVALID')),
            );
            response.on('error', () =>
              done(error('SOURCE_CONNECTION_HTTP_FAILED')),
            );
            response.on('end', () => {
              if (settled) return;
              try {
                done(null, JSON.parse(Buffer.concat(chunks).toString('utf8')));
              } catch {
                done(error('SOURCE_CONNECTION_RESPONSE_INVALID'));
              }
            });
          },
        );
        active.add(req);
        req.on('error', () => done(error('SOURCE_CONNECTION_HTTP_FAILED')));
        timer = setTimeout(
          () => done(error('SOURCE_CONNECTION_HTTP_TIMEOUT')),
          4000,
        );
        req.end(encoded);
      } catch {
        done(error('SOURCE_CONNECTION_HTTP_FAILED'));
      }
    });
  }
  return {
    async listBuckets() {
      const output = [];
      for (let offset = 0; offset <= 1000; offset += 1000) {
        const page = await json(
          'GET',
          `/storage/v1/bucket?limit=1000&offset=${offset}&sortColumn=name&sortOrder=asc`,
        );
        check(
          Array.isArray(page) && page.length <= 1000,
          'SOURCE_CONNECTION_PAGE_INVALID',
        );
        output.push(...page);
        check(output.length <= 1000, 'SOURCE_CONNECTION_LIMIT_EXCEEDED');
        if (page.length < 1000) return output;
      }
      fail('SOURCE_CONNECTION_LIMIT_EXCEEDED');
    },
    async listObjects({ bucketId, cursor, pageSize }) {
      check(
        [
          'user-avatars',
          'specimen-media',
          'exhibit-media',
          'inquiry-attachments',
          'ar-assets',
        ].includes(bucketId) && pageSize === 1000,
        'SOURCE_CONNECTION_PAGE_INVALID',
      );
      let state = states.get(bucketId);
      if (cursor === null) {
        check(!state, 'SOURCE_CONNECTION_PAGE_INVALID');
        state = {
          queue: [{ prefix: '', offset: 0 }],
          prefixes: new Set(['']),
          serial: 0,
          cursor: null,
        };
        states.set(bucketId, state);
      }
      check(
        state && state.cursor === cursor && state.queue.length > 0,
        'SOURCE_CONNECTION_PAGE_INVALID',
      );
      const current = state.queue[0];
      const page = await json(
        'POST',
        `/storage/v1/object/list/${encodeURIComponent(bucketId)}`,
        {
          prefix: current.prefix,
          limit: 1000,
          offset: current.offset,
          sortBy: { column: 'name', order: 'asc' },
        },
      );
      check(
        Array.isArray(page) && page.length <= 1000,
        'SOURCE_CONNECTION_PAGE_INVALID',
      );
      const objects = [];
      for (const row of page) {
        check(
          row &&
            typeof row.name === 'string' &&
            row.name.length > 0 &&
            !row.name.includes('/') &&
            !['.', '..'].includes(row.name),
          'SOURCE_CONNECTION_PAGE_INVALID',
        );
        const key = current.prefix ? `${current.prefix}/${row.name}` : row.name;
        check(key.length <= 1024, 'SOURCE_CONNECTION_PAGE_INVALID');
        if (row.id === null) {
          check(
            row.metadata === null &&
              !state.prefixes.has(key) &&
              state.prefixes.size < 10000 &&
              key.split('/').length <= 64,
            'SOURCE_CONNECTION_PAGE_INVALID',
          );
          state.prefixes.add(key);
          state.queue.push({ prefix: key, offset: 0 });
        } else {
          check(
            typeof row.id === 'string' && row.id.length > 0,
            'SOURCE_CONNECTION_PAGE_INVALID',
          );
          const size = row.metadata?.size;
          objects.push({
            key,
            sizeBytes: size === undefined || size === null ? null : size,
          });
        }
      }
      if (page.length < 1000) state.queue.shift();
      else current.offset += page.length;
      state.cursor = state.queue.length ? String(++state.serial) : null;
      return { objects, nextCursor: state.cursor };
    },
    close() {
      closed = true;
      for (const req of active) req.destroy();
      active.clear();
    },
  };
}
async function runConfiguredInventory(argv, dependencies = {}) {
  if (
    Array.isArray(argv) &&
    (argv.length === 0 ||
      (argv.length === 1 && ['plan', 'help'].includes(argv[0])))
  ) {
    return {
      code: 'SOURCE_CONNECTION_PLAN',
      connectionEnabled: false,
      exportsEnabled: false,
      deploymentAuthorized: false,
    };
  }
  if (
    !Array.isArray(argv) ||
    argv.length !== 5 ||
    argv[0] !== 'inspect' ||
    argv[1] !== '--project-ref' ||
    !/^[a-z0-9]{20}$/.test(argv[2]) ||
    argv[3] !== '--authorization-ref' ||
    !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(argv[4])
  )
    return {
      code: 'SOURCE_CONNECTION_ARGUMENTS_INVALID',
      completeBackup: false,
      deploymentAuthorized: false,
    };
  let database, storage;
  let result;
  try {
    const config = configuration(
      argv[2],
      dependencies.environment ?? process.env,
    );
    const createClient =
      dependencies.createClient ??
      ((options) => new (require('pg').Client)(options));
    const request = dependencies.request ?? require('node:https').request;
    database = createClient(config.database);
    database.on('error', () => {}); // Do not expose asynchronous provider diagnostics.
    await database.connect();
    storage = storageAdapter(config, request);
    result = await require('./source-inventory.cjs').runInventory(['inspect'], {
      database,
      expectedDatabase: 'postgres',
      storage,
    });
    result.configuredProjectAddressesAgree = true;
  } catch (error) {
    const allowed = new Set([
      'SOURCE_CONNECTION_RUNTIME_UNSAFE',
      'SOURCE_CONNECTION_CONFIGURATION_INVALID',
    ]);
    result = {
      code: allowed.has(error?.safeCode)
        ? error.safeCode
        : database
          ? 'SOURCE_CONNECTION_FAILED'
          : 'SOURCE_CONNECTION_CONFIGURATION_INVALID',
      completeBackup: false,
      deploymentAuthorized: false,
    };
  } finally {
    storage?.close();
    if (database) {
      try {
        await database.end();
      } catch {
        result = {
          code: 'SOURCE_CONNECTION_CLEANUP_FAILED',
          completeBackup: false,
          deploymentAuthorized: false,
        };
      }
    }
  }
  return result;
}
module.exports = { runConfiguredInventory };
if (require.main === module) {
  runConfiguredInventory(process.argv.slice(2)).then((result) => {
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = [
      'SOURCE_CONNECTION_PLAN',
      'SOURCE_INVENTORY_RECORDED',
    ].includes(result.code)
      ? 0
      : 1;
  });
}
