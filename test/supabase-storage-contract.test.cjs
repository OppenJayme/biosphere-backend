const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  requireAnonymousObjectHidden,
  containsFixtureObjectFile,
} = require('../scripts/recovery/supabase-storage-contract.cjs');

test('a malformed HTTP 400 is not accepted as private-object access denial', async () => {
  const response = Response.json(
    { statusCode: '400', error: 'BadRequest', message: 'Malformed request' },
    { status: 400 },
  );
  await assert.rejects(requireAnonymousObjectHidden(response), {
    code: 'STORAGE_DENIAL_CONTRACT_MISMATCH',
  });
});

test('the observed HTTP 400 with a hidden-object JSON 404 is accepted', async () => {
  const response = Response.json(
    { statusCode: '404', error: 'not_found', message: 'Object not found' },
    { status: 400 },
  );
  assert.deepEqual(await requireAnonymousObjectHidden(response), {
    status: 400,
    statusCode: '404',
    error: 'not_found',
    message: 'Object not found',
  });
});

test('the archive recognizes the exact fixture filename in nested file-backend paths', () => {
  assert.equal(
    containsFixtureObjectFile('./tenant/bucket/probe.txt/version-id\n'),
    true,
  );
});
test('archive suffix matches and a directory without payload do not count as the object file', () => {
  for (const listing of [
    './tenant/probe.txt.tmp/version-id\n',
    './prefix-probe.txt\n',
    './tenant/probe.txt/\n',
  ])
    assert.equal(containsFixtureObjectFile(listing), false);
});

const invalid = [
  [
    'a wrong-route HTTP 404',
    () =>
      Response.json(
        { statusCode: '404', error: 'not_found', message: 'Object not found' },
        { status: 404 },
      ),
  ],
  [
    'an authentication HTTP 401',
    () =>
      Response.json(
        { statusCode: '401', error: 'Unauthorized', message: 'Invalid token' },
        { status: 401 },
      ),
  ],
  [
    'an unrelated JSON error',
    () =>
      Response.json(
        { statusCode: '404', error: 'BadRequest', message: 'Object not found' },
        { status: 400 },
      ),
  ],
  [
    'a non-JSON response',
    () => new Response('<html>bad request</html>', { status: 400 }),
  ],
  [
    'an unexpected message',
    () =>
      Response.json(
        { statusCode: '404', error: 'not_found', message: 'Malformed request' },
        { status: 400 },
      ),
  ],
];
for (const [name, response] of invalid)
  test(`${name} is not counted as the pinned RLS denial`, async () => {
    await assert.rejects(requireAnonymousObjectHidden(response()), {
      code: 'STORAGE_DENIAL_CONTRACT_MISMATCH',
    });
  });
