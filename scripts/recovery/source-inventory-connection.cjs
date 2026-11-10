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
  const secretKey = typeof key === 'string' && key.startsWith('sb_secret_');
  check(
    typeof key === 'string' &&
      /^[A-Za-z0-9._-]{16,4096}$/.test(key) &&
      (secretKey
        ? bearer === undefined || bearer === ''
        : typeof bearer === 'string' &&
          /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer) &&
          bearer.length <= 8192),
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
    bearer: secretKey ? undefined : bearer,
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
      query_timeout: 7000,
      application_name: 'biosphere-read-only-inventory',
    },
  };
}
async function summarizeDatabaseObjects(database, bucketIds) {
  const result = await database.query(
    `WITH visible AS (
    SELECT bucket_id, name, metadata->'size' AS size_json, metadata->>'size' AS size_text
    FROM storage.objects WHERE bucket_id = ANY($1::text[])
  ), classified AS (
    SELECT *, CASE
      WHEN name IS NULL OR name = '' THEN 'invalid'
      WHEN size_json IS NULL OR size_json = 'null'::jsonb THEN 'unknown'
      WHEN jsonb_typeof(size_json) = 'number' AND length(size_text) <= 32
        AND size_text ~ '^(0|[1-9][0-9]*)([.]0+)?$'
        THEN CASE WHEN size_text::numeric <= 9007199254740991 THEN 'known' ELSE 'invalid' END
      ELSE 'invalid' END AS kind
    FROM visible
  ), marked AS (
    SELECT *, CASE WHEN kind = 'known' THEN size_text::numeric = 0 AND
      (name = '.emptyFolderPlaceholder' OR right(name, length('/.emptyFolderPlaceholder')) = '/.emptyFolderPlaceholder')
      ELSE false END AS placeholder
    FROM classified
  )
  SELECT requested.bucket_id,
    row_security_active('storage.objects'::regclass) AS row_security_active,
    count(marked.bucket_id) FILTER (WHERE NOT marked.placeholder)::text AS objects,
    count(marked.bucket_id) FILTER (WHERE NOT marked.placeholder AND kind = 'unknown')::text AS unknown,
    count(marked.bucket_id) FILTER (WHERE NOT marked.placeholder AND kind = 'invalid')::text AS invalid,
    count(marked.bucket_id) FILTER (WHERE marked.placeholder)::text AS placeholders,
    trunc(coalesce(sum(CASE WHEN kind = 'known' AND NOT marked.placeholder THEN size_text::numeric ELSE 0 END),0))::text AS bytes
  FROM unnest($1::text[]) AS requested(bucket_id)
  LEFT JOIN marked ON marked.bucket_id = requested.bucket_id
  GROUP BY requested.bucket_id`,
    [bucketIds],
  );
  check(
    result.rows.length === bucketIds.length &&
      result.rows.every(
        (row) =>
          typeof row.row_security_active === 'boolean' &&
          row.row_security_active === result.rows[0].row_security_active,
      ),
    'SOURCE_CONNECTION_RESPONSE_INVALID',
  );
  return {
    rowSecurityActive: result.rows[0].row_security_active,
    buckets: result.rows.map((row) => ({
      bucketId: row.bucket_id,
      objects: row.objects,
      declaredObjectBytes: row.bytes,
      unknownSizeObjects: row.unknown,
      invalidSizeObjects: row.invalid,
      placeholderObjects: row.placeholders,
    })),
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
              ...(config.bearer
                ? { Authorization: `Bearer ${config.bearer}` }
                : {}),
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
      let excludedPlaceholders = 0;
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
          if (row.name === '.emptyFolderPlaceholder' && size === 0) {
            excludedPlaceholders++;
            continue;
          }
          objects.push({
            key,
            sizeBytes: size === undefined || size === null ? null : size,
          });
        }
      }
      if (page.length < 1000) state.queue.shift();
      else current.offset += page.length;
      state.cursor = state.queue.length ? String(++state.serial) : null;
      return { objects, nextCursor: state.cursor, excludedPlaceholders };
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
    ![5, 7].includes(argv.length) ||
    argv[0] !== 'inspect' ||
    argv[1] !== '--project-ref' ||
    !/^[a-z0-9]{20}$/.test(argv[2]) ||
    argv[3] !== '--authorization-ref' ||
    !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(argv[4]) ||
    (argv.length === 7 &&
      (argv[5] !== '--object-source' || !['api', 'database'].includes(argv[6])))
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
    if (argv.length === 5 || argv[6] === 'database') {
      storage.summarizeObjects = ({ bucketIds }) =>
        summarizeDatabaseObjects(database, bucketIds);
    }
    result = await require('./source-inventory.cjs').runInventory(['inspect'], {
      database,
      expectedDatabase: 'postgres',
      storage,
    });
    if (result.code === 'SOURCE_INVENTORY_RECORDED')
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
  result.authorizationReferenceSha256 = require('node:crypto')
    .createHash('sha256')
    .update(argv[4], 'utf8')
    .digest('hex');
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
