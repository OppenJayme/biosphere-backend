'use strict';
// Exact observed private-object denial for the pinned Storage v1.89.12 lab.
async function requireAnonymousObjectHidden(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    /* rejected below */
  }
  if (
    response.status !== 400 ||
    body?.statusCode !== '404' ||
    body?.error !== 'not_found' ||
    body?.message !== 'Object not found'
  ) {
    throw Object.assign(new Error('STORAGE_DENIAL_CONTRACT_MISMATCH'), {
      code: 'STORAGE_DENIAL_CONTRACT_MISMATCH',
      safeCode: 'STORAGE_DENIAL_CONTRACT_MISMATCH',
    });
  }
  return {
    status: response.status,
    statusCode: body.statusCode,
    error: body.error,
    message: body.message,
  };
}
function containsFixtureObjectFile(listing) {
  // File-backend paths are nested by tenant/bucket/version, not root ./probe.txt.
  return listing
    .split('\n')
    .some(
      (entry) =>
        entry && !entry.endsWith('/') && entry.split('/').includes('probe.txt'),
    );
}
module.exports = { requireAnonymousObjectHidden, containsFixtureObjectFile };
