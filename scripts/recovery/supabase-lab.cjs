#!/usr/bin/env node
'use strict';
// Synthetic local lab only. Never loads dotenv, Supabase CLI state or app providers.
const { execFileSync } = require('node:child_process');
const { randomUUID, randomBytes, createHmac } = require('node:crypto');
const os = require('node:os');
const images = require('./supabase-lab-images.json').images;
const {
  requireAnonymousObjectHidden,
} = require('./supabase-storage-contract.cjs');
const {
  POLICY_SQL,
  inventory,
  recoverPlatform,
} = require('./supabase-platform-recovery.cjs');
const socket =
  process.platform === 'win32'
    ? 'npipe:////./pipe/dockerDesktopLinuxEngine'
    : 'unix:///var/run/docker.sock';
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    [
      'path',
      'systemroot',
      'windir',
      'comspec',
      'pathext',
      'temp',
      'tmp',
      'userprofile',
      'localappdata',
      'appdata',
      'programfiles',
      'programdata',
    ].includes(key.toLowerCase()),
  ),
);
const owner = randomUUID();
const label = 'biosphere.supabase-lab.owner';
const containers = [];
const networks = [];
const expected = new Map();
let probeId;
let phase = 'arguments';
function check(value, code) {
  if (!value) throw Object.assign(new Error(code), { safeCode: code });
}
function docker(args, input, binary = false) {
  try {
    const result = execFileSync('docker', ['--host', socket, ...args], {
      env,
      input,
      encoding: binary ? undefined : 'utf8',
      windowsHide: true,
      timeout: 90000,
      maxBuffer: binary ? 32 * 1024 * 1024 : 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return binary ? result : result.trim();
  } catch {
    throw Object.assign(new Error('DOCKER_COMMAND_FAILED'), {
      safeCode: 'DOCKER_COMMAND_FAILED',
    });
  }
}
function inspect(id, kind = 'container') {
  return JSON.parse(docker([kind, 'inspect', id]))[0];
}
function network(internal) {
  const id = docker([
    'network',
    'create',
    '--driver',
    'bridge',
    '--label',
    `${label}=${owner}`,
    ...(internal ? ['--internal'] : []),
    `biosphere-lab-${owner}-${internal ? 'inside' : 'counter'}`,
  ]);
  networks.push(id);
  check(inspect(id, 'network').Internal === internal, 'NETWORK_MODE_MISMATCH');
  return id;
}
function create({
  name,
  image,
  net,
  port,
  memory = '128m',
  tmpfs = [],
  vars = {},
  entrypoint,
  command = [],
}) {
  const args = [
    'create',
    '--name',
    `biosphere-lab-${owner}-${name}`,
    '--label',
    `${label}=${owner}`,
    '--network',
    net,
    '--network-alias',
    name,
    '--memory',
    memory,
    '--memory-swap',
    memory,
    '--cpus',
    '1',
    '--pids-limit',
    '256',
    '--log-driver',
    'none',
    '--security-opt',
    'no-new-privileges',
    ...tmpfs.flatMap((value) => ['--tmpfs', value]),
    ...Object.entries(vars).flatMap(([key, value]) => [
      '--env',
      `${key}=${value}`,
    ]),
    // Docker CLI may otherwise inject configured proxy URLs/credentials.
    ...[
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'ALL_PROXY',
      'NO_PROXY',
      'http_proxy',
      'https_proxy',
      'all_proxy',
      'no_proxy',
    ].flatMap((key) => ['--env', `${key}=`]),
    ...(port ? ['--publish', `127.0.0.1::${port}`] : []),
    ...(entrypoint ? ['--entrypoint', entrypoint] : []),
    image,
    ...command,
  ];
  const id = docker(args);
  check(/^[0-9a-f]{64}$/.test(id), 'INVALID_CONTAINER_ID');
  containers.push(id);
  expected.set(id, {
    net,
    port,
    image: inspect(image, 'image').Id,
    memory: Number.parseInt(memory, 10) * 1024 ** 2,
  });
  validate(id, false);
  docker(['start', id]);
  validate(id, true);
  return id;
}
function validate(id, running) {
  const actual = inspect(id);
  const spec = expected.get(id);
  check(
    actual.Id === id &&
      actual.Config.Labels[label] === owner &&
      actual.Image === spec.image &&
      actual.State.Running === running &&
      actual.HostConfig.LogConfig.Type === 'none' &&
      actual.HostConfig.Privileged === false &&
      !actual.HostConfig.Binds?.length &&
      actual.HostConfig.Memory === spec.memory &&
      actual.HostConfig.MemorySwap === spec.memory &&
      actual.HostConfig.NanoCpus === 1000000000 &&
      actual.HostConfig.PidsLimit === 256 &&
      actual.HostConfig.PublishAllPorts === false &&
      actual.Config.Env.filter((value) =>
        /^(https?|all|no)_proxy=/i.test(value),
      ).every((value) => value.endsWith('=')) &&
      actual.Mounts.every((mount) => mount.Type === 'tmpfs'),
    'CONTAINER_CONTAINMENT_MISMATCH',
  );
  const membership = Object.values(actual.NetworkSettings.Networks);
  check(
    actual.HostConfig.NetworkMode === spec.net &&
      membership.length === 1 &&
      (!running || membership[0].NetworkID === spec.net),
    'NETWORK_MEMBERSHIP_MISMATCH',
  );
  const bindings = Object.entries(actual.HostConfig.PortBindings ?? {});
  check(
    spec.port
      ? bindings.length === 1 &&
          bindings[0][0] === `${spec.port}/tcp` &&
          bindings[0][1].length === 1 &&
          bindings[0][1][0].HostIp === '127.0.0.1'
      : bindings.length === 0,
    'PORT_BINDING_MISMATCH',
  );
}
function endpoint(id, port) {
  const binding = inspect(id).NetworkSettings.Ports[`${port}/tcp`];
  check(
    binding?.length === 1 &&
      binding[0].HostIp === '127.0.0.1' &&
      /^\d+$/.test(binding[0].HostPort),
    'UNSAFE_ENDPOINT',
  );
  return `http://127.0.0.1:${binding[0].HostPort}`;
}
async function request(url, options = {}) {
  const parsed = new URL(url);
  check(
    parsed.hostname === '127.0.0.1' && parsed.protocol === 'http:',
    'NON_LOOPBACK_REQUEST',
  );
  return fetch(url, {
    ...options,
    redirect: 'error',
    signal: AbortSignal.timeout(3000),
  });
}
async function wait(url, transport = request) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const result = await transport(url);
      if (result.ok) return;
    } catch {
      /* bounded readiness polling */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  check(false, 'SERVICE_NOT_READY');
}
async function containment(inside, outside) {
  const counterScript = `let hits=0; require('http').createServer((q,s)=>{if(q.url==='/hit')hits++;s.end(String(hits))}).listen(8080,'0.0.0.0')`;
  const counter = create({
    name: 'counter',
    image: images.storage.image,
    net: outside,
    port: 8080,
    entrypoint: 'node',
    command: ['-e', counterScript],
  });
  const probe = create({
    name: 'probe',
    image: images.storage.image,
    net: inside,
    entrypoint: 'node',
    command: ['-e', 'setInterval(()=>{},10000)'],
  });
  probeId = probe;
  const counterUrl = endpoint(counter, 8080);
  await wait(`${counterUrl}/count`);
  check(
    (await (await request(`${counterUrl}/hit`)).text()) === '1',
    'COUNTER_CONTROL_FAILED',
  );
  const counterIp = Object.values(inspect(counter).NetworkSettings.Networks)[0]
    .IPAddress;
  check(/^\d+\.\d+\.\d+\.\d+$/.test(counterIp), 'INVALID_COUNTER_ADDRESS');
  const probeResult = docker([
    'exec',
    probe,
    'node',
    '-e',
    `fetch('http://${counterIp}:8080/hit',{signal:AbortSignal.timeout(1500),redirect:'error'}).then(()=>{console.log('REACHED');process.exitCode=1}).catch(()=>console.log('BLOCKED'))`,
  ]);
  check(
    probeResult === 'BLOCKED' &&
      (await (await request(`${counterUrl}/count`)).text()) === '1',
    'EGRESS_NOT_BLOCKED',
  );
  return { containment: 'PASS', outsideControlHits: 1, blockedAttemptHits: 0 };
}
async function platform(inside, prefix = '') {
  // Private services never publish ports. HTTP crosses their real API boundary
  // from the single-network owned probe; HTTP request payloads use stdin.
  // Synthetic DB passwords/JWT config also use Docker argv/environment and
  // remain visible to local process/Docker inspection. Never use real secrets.
  const serviceRequest = async (url, options = {}) => {
    check(
      new RegExp(
        '^http://(' + prefix + 'auth:9999|' + prefix + 'storage:5000)/',
      ).test(url),
      'UNSAFE_SERVICE_URL',
    );
    const payload = {
      url,
      options: {
        ...options,
        ...(Buffer.isBuffer(options.body)
          ? { body: { base64: options.body.toString('base64') } }
          : {}),
      },
    };
    const script = `const fs=require('fs');const q=JSON.parse(fs.readFileSync(0,'utf8'));
      if(q.options.body?.base64)q.options.body=Buffer.from(q.options.body.base64,'base64');
      fetch(q.url,{...q.options,redirect:'error',signal:AbortSignal.timeout(3000)})
      .then(async r=>console.log(JSON.stringify({status:r.status,body:Buffer.from(await r.arrayBuffer()).toString('base64')})))
      .catch(()=>process.exitCode=1);`;
    const result = JSON.parse(
      docker(
        ['exec', '-i', probeId, 'node', '-e', script],
        JSON.stringify(payload),
      ),
    );
    return new Response(Buffer.from(result.body, 'base64'), {
      status: result.status,
    });
  };
  const password = randomBytes(24).toString('hex');
  const secret = randomBytes(32).toString('hex');
  const make = (options) => create({ ...options, name: prefix + options.name });
  const token = (role) => {
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        role,
        iss: 'supabase',
        aud: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');
    const value = `${header}.${payload}`;
    return `${value}.${createHmac('sha256', secret).update(value).digest('base64url')}`;
  };
  phase = 'database-start';
  const db = make({
    name: 'database',
    image: images.database.image,
    net: inside,
    memory: '768m',
    tmpfs: ['/var/lib/postgresql/data:rw,size=512m'],
    vars: {
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: 'postgres',
      JWT_EXP: '3600',
    },
    command: [
      'postgres',
      '-c',
      'config_file=/etc/postgresql/postgresql.conf',
      '-c',
      'log_min_messages=fatal',
    ],
  });
  const sql = (statement) =>
    docker(
      [
        'exec',
        '-i',
        '--env',
        `PGPASSWORD=${password}`,
        db,
        'psql',
        '-X',
        '-qAt',
        '-v',
        'ON_ERROR_STOP=1',
        '-h',
        '127.0.0.1',
        '-U',
        'supabase_admin',
        '-d',
        'postgres',
      ],
      statement,
    );
  let ready = false;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    check(inspect(db).State.Running, 'DATABASE_EXITED');
    try {
      ready = sql('SELECT 1;') === '1';
      if (ready) break;
    } catch {
      /* owned database startup */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  check(ready, 'DATABASE_NOT_READY');
  phase = 'database-roles';
  // Equivalent to the selected release's roles.sql; generated hexadecimal input only.
  sql(`ALTER USER authenticator WITH PASSWORD '${password}';
    ALTER USER supabase_auth_admin WITH PASSWORD '${password}';
    ALTER USER supabase_storage_admin WITH PASSWORD '${password}';`);
  phase = 'auth-start';
  const auth = make({
    name: 'auth',
    image: images.auth.image,
    net: inside,
    memory: '256m',
    entrypoint: '/bin/sh',
    command: ['-c', 'exec auth > /tmp/lab-startup.log 2>&1'],
    vars: {
      GOTRUE_API_HOST: '0.0.0.0',
      GOTRUE_API_PORT: '9999',
      API_EXTERNAL_URL: `http://${prefix}auth:9999`,
      GOTRUE_SITE_URL: 'http://127.0.0.1',
      GOTRUE_DB_DRIVER: 'postgres',
      GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${password}@${prefix}database:5432/postgres`,
      GOTRUE_JWT_SECRET: secret,
      GOTRUE_JWT_EXP: '3600',
      GOTRUE_JWT_AUD: 'authenticated',
      GOTRUE_JWT_ADMIN_ROLES: 'service_role',
      GOTRUE_JWT_DEFAULT_GROUP_NAME: 'authenticated',
      GOTRUE_DISABLE_SIGNUP: 'true',
      GOTRUE_EXTERNAL_EMAIL_ENABLED: 'true',
      GOTRUE_EXTERNAL_PHONE_ENABLED: 'false',
      GOTRUE_MAILER_AUTOCONFIRM: 'true',
      GOTRUE_SMTP_HOST: '127.0.0.1',
      GOTRUE_SMTP_PORT: '1',
      GOTRUE_SMTP_ADMIN_EMAIL: 'lab@example.invalid',
      GOTRUE_SMTP_LOGGING_ENABLED: 'false',
    },
  });
  validate(auth, true);
  const authUrl = `http://${prefix}auth:9999`;
  await wait(`${authUrl}/health`, serviceRequest);
  phase = 'storage-start';
  const rest = make({
    name: 'rest',
    image: images.rest.image,
    net: inside,
    memory: '128m',
    vars: {
      PGRST_DB_URI: `postgres://authenticator:${password}@${prefix}database:5432/postgres`,
      PGRST_DB_SCHEMAS: 'public,storage',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_JWT_SECRET: secret,
    },
  });
  const service = token('service_role');
  const anon = token('anon');
  const storage = make({
    name: 'storage',
    image: images.storage.image,
    net: inside,
    memory: '512m',
    tmpfs: ['/var/lib/storage:rw,size=32m,mode=1777'],
    vars: {
      ANON_KEY: anon,
      SERVICE_KEY: service,
      AUTH_JWT_SECRET: secret,
      POSTGREST_URL: `http://${prefix}rest:3000`,
      DATABASE_URL: `postgres://supabase_storage_admin:${password}@${prefix}database:5432/postgres`,
      STORAGE_PUBLIC_URL: `http://${prefix}storage:5000`,
      STORAGE_BACKEND: 'file',
      FILE_STORAGE_BACKEND_PATH: '/var/lib/storage',
      FILE_SIZE_LIMIT: '1048576',
      TENANT_ID: 'synthetic-lab',
      GLOBAL_S3_BUCKET: 'synthetic-lab',
      REGION: 'local',
      ENABLE_IMAGE_TRANSFORMATION: 'false',
    },
  });
  validate(storage, true);
  const storageUrl = `http://${prefix}storage:5000`;
  await wait(`${storageUrl}/status`, serviceRequest);
  for (const id of [db, auth, rest, storage]) validate(id, true);
  return {
    db,
    auth,
    rest,
    storage,
    sql,
    serviceRequest,
    secret,
    service,
    anon,
    authUrl,
    storageUrl,
    baseline: inventory(sql),
    ids: [db, auth, rest, storage],
  };
}
async function smoke(inside, recover = false) {
  const source = await platform(inside);
  const { sql, serviceRequest, service, anon, authUrl, storageUrl } = source;
  phase = 'auth-requests';
  const email = `lab-${owner}@example.invalid`;
  const userPassword = randomBytes(24).toString('base64url');
  const json = (value, jwt) => ({
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify(value),
  });
  const createdResponse = await serviceRequest(
    `${authUrl}/admin/users`,
    json({ email, password: userPassword, email_confirm: true }, service),
  );
  check(createdResponse.ok, 'AUTH_CREATE_FAILED');
  const user = await createdResponse.json();
  const signIn = await serviceRequest(
    `${authUrl}/token?grant_type=password`,
    json({ email, password: userPassword }),
  );
  check(signIn.ok, 'AUTH_PASSWORD_FAILED');
  const session = await signIn.json();
  const identity = await serviceRequest(`${authUrl}/user`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  check(
    identity.ok && (await identity.json()).id === user.id,
    'AUTH_IDENTITY_MISMATCH',
  );
  phase = 'storage-requests';
  const bucket = 'synthetic-private';
  const bucketResponse = await serviceRequest(
    `${storageUrl}/bucket`,
    json({ id: bucket, name: bucket, public: false }, service),
  );
  check(bucketResponse.ok, 'BUCKET_CREATE_FAILED');
  sql(POLICY_SQL);
  const bytes = Buffer.from(
    'BioSphere synthetic private storage probe\n',
    'utf8',
  );
  const headers = { Authorization: `Bearer ${session.access_token}` };
  const uploaded = await serviceRequest(
    `${storageUrl}/object/${bucket}/probe.txt`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'text/plain' },
      body: bytes,
    },
  );
  check(uploaded.ok, 'STORAGE_UPLOAD_FAILED');
  const objectUrl = `${storageUrl}/object/authenticated/${bucket}/probe.txt`;
  const downloaded = await serviceRequest(objectUrl, { headers });
  check(
    downloaded.ok && Buffer.from(await downloaded.arrayBuffer()).equals(bytes),
    'STORAGE_BYTES_MISMATCH',
  );
  const denied = await serviceRequest(objectUrl, {
    headers: { Authorization: `Bearer ${anon}` },
  });
  const anonymousDenial = await requireAnonymousObjectHidden(denied);
  if (recover)
    return recoverPlatform({
      inside,
      source,
      fixture: {
        email,
        userPassword,
        userId: user.id,
        bucket,
        bytes,
        sourceAccessToken: session.access_token,
        sourceRefreshToken: session.refresh_token,
      },
      docker,
      inspect,
      validate,
      check,
      platform,
      images,
      setPhase: (value) => {
        phase = value;
      },
    });
  return {
    auth: 'PASSWORD_AND_IDENTITY_VERIFIED',
    storage: 'PRIVATE_BYTES_VERIFIED',
    anonymous: 'DENIED',
    anonymousStatus: denied.status,
    anonymousDenial,
  };
}
function cleanup() {
  let complete = true;
  for (const id of [...containers].reverse()) {
    try {
      const actual = inspect(id);
      check(
        actual.Id === id && actual.Config.Labels[label] === owner,
        'CLEANUP_OWNER_MISMATCH',
      );
      docker(['rm', '--force', id]);
    } catch {
      complete = false;
    }
  }
  for (const id of [...networks].reverse()) {
    try {
      const actual = inspect(id, 'network');
      check(
        actual.Id === id &&
          actual.Labels[label] === owner &&
          Object.keys(actual.Containers ?? {}).length === 0,
        'CLEANUP_OWNER_MISMATCH',
      );
      docker(['network', 'rm', id]);
    } catch {
      complete = false;
    }
  }
  return complete ? 'COMPLETE' : 'INCOMPLETE';
}
async function main() {
  let evidence;
  try {
    check(
      process.argv.length === 3 &&
        ['containment', 'smoke', 'recover'].includes(process.argv[2]),
      'UNSUPPORTED_COMMAND',
    );
    phase = 'preflight';
    check(
      ['win32', 'linux'].includes(process.platform),
      'UNSUPPORTED_PLATFORM',
    );
    // Reduced smoke has a 1,920 MiB hard container cap; full recovery still needs 5 GiB.
    check(
      os.freemem() >=
        { containment: 3, smoke: 4, recover: 5 }[process.argv[2]] * 1024 ** 3,
      'INSUFFICIENT_HOST_MEMORY',
    );
    const info = JSON.parse(docker(['info', '--format', '{{json .}}']));
    check(
      info.OSType === 'linux' &&
        info.Architecture === 'x86_64' &&
        info.MemTotal >= 4 * 1024 ** 3,
      'ENGINE_CAPACITY_MISMATCH',
    );
    for (const spec of Object.values(images)) inspect(spec.image, 'image');
    phase = 'containment';
    const inside = network(true);
    const outside = network(false);
    evidence = await containment(inside, outside);
    if (process.argv[2] !== 'containment')
      evidence = {
        ...evidence,
        ...(await smoke(inside, process.argv[2] === 'recover')),
      };
  } catch (error) {
    evidence = {
      result: 'FAILED',
      phase,
      code: error.safeCode ?? 'LAB_CHECK_FAILED',
    };
    process.exitCode = 1;
  } finally {
    const result = cleanup();
    evidence = { ...evidence, cleanup: result };
    if (result !== 'COMPLETE') process.exitCode = 1;
    process.stdout.write(JSON.stringify(evidence) + '\n');
  }
}
if (require.main === module) void main();
