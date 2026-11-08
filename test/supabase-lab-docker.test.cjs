const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Docker subprocess environment excludes application credentials, provider settings and proxies', () => {
  const {
    isolatedEnvironment,
  } = require('../scripts/recovery/supabase-lab-docker.cjs');
  assert.deepEqual(
    isolatedEnvironment({
      PATH: 'synthetic-tools',
      SystemRoot: 'synthetic-os',
      TEMP: 'synthetic-temp',
      DATABASE_URL: 'synthetic-db-secret',
      SUPABASE_SECRET_KEY: 'synthetic-provider-secret',
      DOCKER_HOST: 'tcp://example.invalid:1',
      DOCKER_CONFIG: 'untrusted',
      HTTP_PROXY: 'untrusted',
      NODE_OPTIONS: 'untrusted',
    }),
    {
      PATH: 'synthetic-tools',
      SystemRoot: 'synthetic-os',
      TEMP: 'synthetic-temp',
    },
  );
});
