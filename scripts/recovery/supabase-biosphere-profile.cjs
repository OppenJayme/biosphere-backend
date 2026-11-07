'use strict';
// Fixed synthetic BioSphere graph; no supplied source, records or destination.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { verifyBuild } = require('./worker-build.cjs');
const {
  requireAnonymousObjectHidden,
} = require('./supabase-storage-contract.cjs');
const root = path.resolve(__dirname, '../..');
const BUCKETS = [
  'user-avatars',
  'specimen-media',
  'exhibit-media',
  'inquiry-attachments',
  'ar-assets',
];
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const IDS = Object.freeze({
  account: id(1),
  collection: id(2),
  specimen: id(3),
  storage: id(4),
  lot: id(5),
  media: id(6),
  exhibit: id(7),
  inquiry: id(8),
  faq: id(9),
  audit: id(10),
});
const PRIMARY_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=',
  'base64',
);
const sha = (v) => createHash('sha256').update(v).digest('hex');
const APP_SETTINGS = Object.freeze({
  NODE_ENV: 'test',
  BREVO_API_KEY: '',
  MAIL_FROM_EMAIL: 'museum@example.invalid',
  MAIL_FROM_NAME: 'Synthetic Museum',
  FRONTEND_URL: 'http://127.0.0.1',
  PUBLIC_SITE_URL: 'http://127.0.0.1',
  CURATOR_ALERT_EMAILS: '',
  NOTIFICATION_STATE_ENABLED: 'true',
  FAQ_REVIEW_ENABLED: '',
  RECOVERY_HISTORY_RECORDING_ENABLED: '',
});
const POLICY_SQL = `CREATE POLICY biosphere_lab_owner_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN (${BUCKETS.map((b) => `'${b}'`).join(',')}) AND owner_id = (SELECT auth.jwt()->>'sub'));
  CREATE POLICY biosphere_lab_owner_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN (${BUCKETS.map((b) => `'${b}'`).join(',')}) AND owner_id = (SELECT auth.jwt()->>'sub'));`;
function rules() {
  return require(path.join(root, 'dist/supabase/storage.config.js'))
    .STORAGE_RULES;
}
function migrationFiles() {
  const base = path.join(root, 'prisma/migrations');
  return fs
    .readdirSync(base)
    .filter((n) => n === '0_init' || /^\d{14}_[a-z0-9_]+$/.test(n))
    .sort()
    .map((name) => {
      const file = path.join(base, name, 'migration.sql');
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 ** 2)
        throw new Error('UNSAFE_LAB_MIGRATION');
      const bytes = fs.readFileSync(file);
      return { name, checksum: sha(bytes), bytes };
    });
}
function recipe() {
  verifyBuild();
  const stamp = JSON.parse(
    fs.readFileSync(path.join(root, 'dist/recovery-worker-build.json'), 'utf8'),
  );
  return {
    profile: 'biosphere-full-v1',
    migrationsHash: sha(
      JSON.stringify(
        migrationFiles().map(({ name, checksum }) => ({ name, checksum })),
      ),
    ),
    bucketRulesHash: sha(JSON.stringify(rules())),
    applicationBuildHash: sha(
      JSON.stringify({ source: stamp.source, runtime: stamp.runtime }),
    ),
    settingsHash: sha(
      JSON.stringify(APP_SETTINGS) +
        [
          'supabase-lab.cjs',
          'supabase-platform-recovery.cjs',
          'supabase-biosphere-profile.cjs',
          'supabase-lab-bridge.cjs',
          'supabase-application-check.cjs',
          'supabase-application-identity.cjs',
          'supabase-checkpoint-store.cjs',
          'supabase-storage-contract.cjs',
          'supabase-lab-images.json',
        ]
          .map(
            (name) =>
              name +
              '\0' +
              fs
                .readFileSync(path.join(__dirname, name), 'utf8')
                .replaceAll('\r\n', '\n'),
          )
          .join('\0'),
    ),
  };
}
function preflight(check, captured) {
  verifyBuild();
  check(
    !fs.existsSync(path.join(root, '.env')),
    'LAB_CHECKOUT_MUST_NOT_HAVE_ENV',
  );
  check(
    Object.keys(rules()).length === 5 &&
      BUCKETS.every((b) => Object.hasOwn(rules(), b)),
    'LAB_BUCKET_CONFIG_CHANGED',
  );
  if (captured) {
    const current = recipe();
    check(
      Object.keys(current).every((key) => current[key] === captured[key]),
      'APPLICATION_RELEASE_MISMATCH',
    );
  }
}
function initialize(service, isolatedEnv, check) {
  const files = migrationFiles();
  check(files[0]?.name === '0_init', 'LAB_BASELINE_MISSING');
  const port = new URL(service.gateway.url).port;
  const databaseUrl = `postgresql://supabase_admin:${service.password}@127.0.0.1:${port}/postgres?schema=public`;
  service.databaseUrl = databaseUrl;
  // A fresh Supabase target already owns Auth. Baseline only this fresh lab DB;
  // all subsequent app migrations run through the real Prisma deployment command.
  service.sql(files[0].bytes.toString('utf8'));
  const env = {
    ...isolatedEnv,
    DIRECT_URL: databaseUrl,
    DATABASE_URL: databaseUrl,
    CHECKPOINT_DISABLE: '1',
    PRISMA_HIDE_UPDATE_MESSAGE: '1',
    HTTP_PROXY: 'http://127.0.0.1:1',
    HTTPS_PROXY: 'http://127.0.0.1:1',
    NO_PROXY: '127.0.0.1,localhost',
  };
  for (const args of [
    ['migrate', 'resolve', '--applied', '0_init'],
    ['migrate', 'deploy'],
  ]) {
    try {
      execFileSync(
        process.execPath,
        [
          '--max-old-space-size=256',
          '--max-semi-space-size=16',
          path.join(root, 'node_modules/prisma/build/index.js'),
          ...args,
        ],
        {
          env,
          cwd: root,
          windowsHide: true,
          timeout: 90000,
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
    } catch {
      check(false, 'LAB_MIGRATION_COMMAND_FAILED');
    }
  }
  const expected = files.map(({ name, checksum }) => ({ name, checksum }));
  const actual = JSON.parse(
    service.sql(`SELECT coalesce(json_agg(json_build_object('name',migration_name,'checksum',checksum) ORDER BY migration_name),'[]')
    FROM public._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;`),
  );
  check(
    JSON.stringify(actual) === JSON.stringify(expected),
    'LAB_MIGRATION_HISTORY_MISMATCH',
  );
  check(
    service.sql(
      'SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;',
    ) === '0',
    'LAB_MIGRATION_INCOMPLETE',
  );
  return recipe();
}
function bucketConfig(bucket) {
  const r = rules()[bucket];
  return {
    id: bucket,
    name: bucket,
    public: false,
    file_size_limit: r.maxBytes,
    allowed_mime_types: Object.keys(r.mimeTypes),
  };
}
function objects() {
  // Small valid fixture payloads, not museum assets. All paths match app ownership.
  const json = Buffer.from(
    '{"asset":{"version":"2.0"},"scene":0,"scenes":[{}]}   ',
  );
  const padded = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 32),
  ]);
  const glb = Buffer.alloc(20 + padded.length);
  glb.write('glTF');
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  glb.write('JSON', 16);
  padded.copy(glb, 20);
  return [
    {
      bucket: BUCKETS[0],
      path: `${IDS.account}/avatar.png`,
      mime: 'image/png',
      bytes: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC',
        'base64',
      ),
    },
    {
      bucket: BUCKETS[1],
      path: `${IDS.specimen}/${IDS.media}.png`,
      mime: 'image/png',
      bytes: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNg+M8AAAICAQB7CYF4AAAAAElFTkSuQmCC',
        'base64',
      ),
    },
    {
      bucket: BUCKETS[2],
      path: `${IDS.exhibit}/${id(11)}.png`,
      mime: 'image/png',
      bytes: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC',
        'base64',
      ),
    },
    {
      bucket: BUCKETS[3],
      path: `${IDS.inquiry}/${id(12)}.png`,
      mime: 'image/png',
      bytes: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4/58BAAT/Af9dfQKHAAAAAElFTkSuQmCC',
        'base64',
      ),
    },
    {
      bucket: BUCKETS[4],
      path: `${IDS.exhibit}/${id(13)}.glb`,
      mime: 'model/gltf-binary',
      bytes: glb,
    },
  ];
}
async function seed(source, fixture, check) {
  const files = objects();
  for (const bucket of BUCKETS.filter((b) => b !== fixture.bucket)) {
    const r = await source.serviceRequest(`${source.storageUrl}/bucket`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${source.service}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bucketConfig(bucket)),
    });
    check(r.ok, 'BIOSPHERE_BUCKET_CREATE_FAILED');
  }
  for (const file of files) {
    const r = await source.serviceRequest(
      `${source.storageUrl}/object/${file.bucket}/${file.path}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${fixture.sourceAccessToken}`,
          'Content-Type': file.mime,
        },
        body: file.bytes,
      },
    );
    check(r.ok, 'BIOSPHERE_OBJECT_UPLOAD_FAILED');
  }
  check(/^[a-f0-9-]{36}$/.test(fixture.userId), 'INVALID_SYNTHETIC_AUTH_ID');
  source.sql(`BEGIN;
    INSERT INTO public.user_account(id,auth_user_id,full_name,role,status,avatar_path) VALUES ('${IDS.account}','${fixture.userId}','Synthetic Recovery Curator','CURATOR','ACTIVE','${files[0].path}');
    INSERT INTO public.collection(id,collection_name) VALUES ('${IDS.collection}','TEST - Recovery Collection');
    INSERT INTO public.storage_unit(id,unit_type,label,storage_type,holds_specimens,capacity) VALUES ('${IDS.storage}','Cabinet','TEST - Recovery Cabinet','Dry',true,100);
    INSERT INTO public.specimen(id,collection_id,created_by,accession_number,common_name,scientific_name,status) VALUES ('${IDS.specimen}','${IDS.collection}','${IDS.account}','TEST-RECOVERY-0001','Synthetic Recovery Beetle','Testus recoverus','UNCATALOGED');
    INSERT INTO public.specimen_taxonomy(specimen_id,kingdom,family) VALUES ('${IDS.specimen}','Animalia','Syntheticidae');
    INSERT INTO public.specimen_provenance(specimen_id,collection_date,preservation_type,preservation_method) VALUES ('${IDS.specimen}','2026-01-01','Dry','Pinned');
    INSERT INTO public.specimen_lot(id,specimen_id,storage_unit_id,condition_class,quantity,created_by) VALUES ('${IDS.lot}','${IDS.specimen}','${IDS.storage}','Good',2,'${IDS.account}');
    INSERT INTO public.specimen_lot_transaction(source_lot_id,transaction_type,quantity_affected,adjustment_type,reason,performed_by) VALUES ('${IDS.lot}','QUANTITY_ADJUSTMENT',1,'ADDITION','Synthetic recovery fixture','${IDS.account}');
    INSERT INTO public.specimen_media(id,specimen_id,storage_path,caption,is_cover) VALUES ('${IDS.media}','${IDS.specimen}','${files[1].path}','Synthetic recovery image',true);
    INSERT INTO public.specimen_revision_history(specimen_id,changed_by,field_changed,new_value,source_section) VALUES ('${IDS.specimen}','${IDS.account}','Common Name','Synthetic Recovery Beetle','Specimen Core');
    INSERT INTO public.tag(id,tag_name) VALUES ('${id(14)}','TEST - Recovery Tag');
    INSERT INTO public.specimen_tag(specimen_id,tag_id) VALUES ('${IDS.specimen}','${id(14)}');
    INSERT INTO public.exhibit(id,specimen_id,created_by,public_slug) VALUES ('${IDS.exhibit}','${IDS.specimen}','${IDS.account}','synthetic-recovery');
    INSERT INTO public.exhibit_media(exhibit_id,storage_path) VALUES ('${IDS.exhibit}','${files[2].path}');
    INSERT INTO public.ar_asset(exhibit_id,storage_path,model_format) VALUES ('${IDS.exhibit}','${files[4].path}','glb');
    INSERT INTO public.inquiry(id,full_name,email_address,inquiry_type,message,attachment_path,consent_accepted_at) VALUES ('${IDS.inquiry}','Synthetic Visitor','visitor@example.invalid','General','Synthetic recovery inquiry','${files[3].path}',now());
    INSERT INTO public.faq_entry(id,question,answer,status,created_by) VALUES ('${IDS.faq}','What is the synthetic recovery code?','The synthetic recovery code is beetle-42.','ACTIVE','${IDS.account}');
    INSERT INTO public.audit_log(id,user_id,action,module,status,details) VALUES ('${IDS.audit}','${IDS.account}','SYNTHETIC_RECOVERY_FIXTURE','Recovery Lab','SUCCESS','{"synthetic":true}');
    INSERT INTO public.backup_history(backup_type,status,started_at,completed_at) VALUES ('SYNTHETIC_REHEARSAL','COMPLETED',now(),now());
    COMMIT;`);
  await verifyBuckets(source, fixture.sourceAccessToken, check);
}
function publicDataHash(sql) {
  const fingerprint = sql(`BEGIN;
    CREATE TEMP TABLE biosphere_lab_hashes(name text, value text) ON COMMIT DROP;
    DO $$ DECLARE t record; BEGIN
      FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename COLLATE "C"
      LOOP EXECUTE format('INSERT INTO biosphere_lab_hashes SELECT %L, md5(coalesce(string_agg(to_jsonb(r)::text, %L ORDER BY to_jsonb(r)::text COLLATE "C"), %L)) FROM public.%I r',t.tablename,'','',t.tablename); END LOOP;
    END $$;
    SELECT json_object_agg(name,value ORDER BY name COLLATE "C") FROM biosphere_lab_hashes; COMMIT;`);
  return sha(fingerprint);
}
async function verifyBuckets(target, access, check) {
  const list = await target.serviceRequest(`${target.storageUrl}/bucket`, {
    headers: { Authorization: `Bearer ${target.service}` },
  });
  check(list.ok, 'RESTORED_BUCKET_LIST_FAILED');
  const buckets = await list.json();
  check(
    buckets.length === 5 &&
      BUCKETS.every((b) =>
        buckets.some(
          (v) =>
            v.id === b &&
            v.public === false &&
            Number(v.file_size_limit) === rules()[b].maxBytes &&
            JSON.stringify([...v.allowed_mime_types].sort()) ===
              JSON.stringify(Object.keys(rules()[b].mimeTypes).sort()),
        ),
      ),
    'RESTORED_BUCKET_CONFIG_CHANGED',
  );
  for (const file of objects()) {
    const url = `${target.storageUrl}/object/authenticated/${file.bucket}/${file.path}`;
    const read = await target.serviceRequest(url, {
      headers: { Authorization: `Bearer ${access}` },
    });
    check(
      read.ok && Buffer.from(await read.arrayBuffer()).equals(file.bytes),
      'RESTORED_BUCKET_BYTES_CHANGED',
    );
    await requireAnonymousObjectHidden(
      await target.serviceRequest(url, {
        headers: { Authorization: `Bearer ${target.anon}` },
      }),
    );
  }
  return BUCKETS;
}
function verifyApplication(target, gateway, fixture, env, check) {
  const config = {
    databaseUrl: target.databaseUrl,
    supabaseUrl: gateway.url,
    serviceKey: target.service,
    anonKey: target.anon,
    email: fixture.email,
    password: fixture.userPassword,
    identity: { ...target.identity, httpGatewayId: gateway.id },
  };
  const execute = (value) =>
    execFileSync(
      process.execPath,
      [
        '--max-old-space-size=256',
        path.join(__dirname, 'supabase-application-check.cjs'),
      ],
      {
        cwd: root,
        env,
        windowsHide: true,
        timeout: 90000,
        stdio: ['pipe', 'pipe', 'pipe'],
        input: JSON.stringify(value),
      },
    ).toString();
  let rejected = false;
  try {
    execute({
      ...config,
      identity: { ...config.identity, marker: '0'.repeat(64) },
    });
  } catch (error) {
    rejected =
      String(error.stderr ?? '').trim() ===
      'LAB_APPLICATION_CONNECTED_IDENTITY_FAILED';
  }
  check(rejected, 'APPLICATION_WRONG_IDENTITY_NOT_REJECTED');
  let response;
  try {
    response = execute(config);
  } catch (error) {
    const code = String(error.stderr ?? '').trim();
    check(
      false,
      /^LAB_APPLICATION_[A-Z_]+_FAILED$/.test(code)
        ? code
        : 'RESTORED_APPLICATION_CHECK_FAILED',
    );
  }
  const result = JSON.parse(response);
  check(
    result.application === 'PROTECTED_HTTP_VERIFIED',
    'RESTORED_APPLICATION_CHECK_FAILED',
  );
  return { ...result, applicationWrongIdentity: 'REJECTED' };
}

module.exports = {
  APP_SETTINGS,
  PRIMARY_BYTES,
  BUCKETS,
  IDS,
  POLICY_SQL,
  preflight,
  initialize,
  bucketConfig,
  objects,
  seed,
  publicDataHash,
  verifyBuckets,
  verifyApplication,
};
