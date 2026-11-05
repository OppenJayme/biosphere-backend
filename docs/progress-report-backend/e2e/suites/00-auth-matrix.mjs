// Every route in the server's own OpenAPI document, called with no JWT, a
// garbage JWT, an expired JWT, a wrongly signed JWT, an inactive account and
// the wrong role. Routes are read at run time, so a new route is covered.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { api, BASE, check, forgeToken, here, section, UNKNOWN_ID } from '../lib.mjs';

const PUBLIC = new Set([
  'GET /',
  'POST /auth/login',
  'POST /auth/onboarding/complete',
  'POST /auth/password/recovery',
  'POST /auth/password/reset',
  'GET /exhibits/public/{slug}',
  'POST /inquiries',
  'POST /visit-requests',
  'GET /faq/assistant/suggestions',
  'POST /faq/assistant/ask',
  'GET /faq/assistant/review-policy',
  'POST /faq/assistant/review-submissions',
]);
const ANY_ROLE = new Set(['GET /auth/me', 'POST /auth/password/change']);
const isDeveloper = (path) => path.startsWith('/developer');

export const routes = [];

export default async function run() {
  section('Access control', ['REQ-4.1-06']);
  const spec = await (await fetch(`${BASE}/docs-json`)).json();
  for (const [path, operations] of Object.entries(spec.paths)) {
    for (const method of Object.keys(operations)) routes.push({ method: method.toUpperCase(), path });
  }
  writeFileSync(join(here, 'routes.json'), `${JSON.stringify(routes, null, 0)}
`);
  check('GET /docs-json', 'inventory', 'server exposes 143 operations', routes.length === 143, {
    expected: 143,
    actual: routes.length,
  });

  const expired = await forgeToken({
    sub: UNKNOWN_ID,
    role: 'authenticated',
    aud: 'authenticated',
    exp: 1600000000,
  });
  const badSig = `${expired.slice(0, -6)}AAAAAA`;

  for (const { method, path } of routes) {
    const key = `${method} ${path}`;
    if (PUBLIC.has(key)) continue;
    const url = path.replace(/\{[^}]+\}/g, UNKNOWN_ID);
    const body = method === 'GET' || method === 'DELETE' ? {} : { json: {} };
    for (const [kind, role] of [
      ['no-jwt', 'none'],
      ['invalid-jwt', 'not.a.jwt'],
      ['expired-jwt', expired],
      ['bad-signature-jwt', badSig],
    ]) {
      const r = await api(role, method, url, body);
      check(key, kind, `${kind} refused with 401`, r.status === 401, {
        expected: 401,
        actual: r.status,
        srs: ['REQ-4.1-06'],
      });
    }
    const inactive = await api('inactive', method, url, body);
    check(key, 'inactive-account', 'inactive account refused', [401, 403].includes(inactive.status), {
      expected: '401|403',
      actual: inactive.status,
      srs: ['REQ-4.1-12'],
    });
    if (ANY_ROLE.has(key)) continue;
    const wrong = isDeveloper(path) ? 'curator' : 'developer';
    const denied = await api(wrong, method, url, body);
    check(key, 'wrong-role', `${wrong} refused with 403`, denied.status === 403, {
      expected: 403,
      actual: denied.status,
      srs: isDeveloper(path)
        ? ['REQ-4.1-14', 'REQ-4.2-08']
        : ['REQ-4.1-14', 'REQ-4.2-06', 'REQ-4.2-07'],
    });
  }
}
