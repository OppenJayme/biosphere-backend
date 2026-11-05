// Invalid-input sweep over every route. A client mistake must get a 4xx and
// never a 5xx. Runs last because it touches only unknown or malformed ids.
import { api, check, section, UNKNOWN_ID } from '../lib.mjs';
import { routes } from './00-auth-matrix.mjs';

const PUBLIC = /^\/(exhibits\/public|auth\/(login|onboarding)|faq\/assistant)/;
const roleFor = (path) => (path.startsWith('/developer') ? 'developer' : 'curator');
const CLIENT_ERROR = [400, 404, 409, 422];

export default async function run() {
  section('Invalid input sweep', []);
  for (const { method, path } of routes) {
    const key = `${method} ${path}`;
    const role = PUBLIC.test(path) ? 'none' : roleFor(path);
    const body = method === 'GET' || method === 'DELETE' ? {} : { json: {} };

    if (path.includes('{')) {
      for (const [label, value] of [['unknown id', UNKNOWN_ID], ['malformed id', 'not-a-uuid']]) {
        const r = await api(role, method, path.replace(/\{[^}]+\}/g, value), body);
        check(key, 'invalid', `${label} gets a client error`, CLIENT_ERROR.includes(r.status), {
          expected: CLIENT_ERROR.join('|'),
          actual: CLIENT_ERROR.includes(r.status) ? r.status : { status: r.status, body: r.body },
        });
      }
    } else if (method === 'GET' && path !== '/') {
      const r = await api(role, method, path, { query: { page: -1, limit: -1, unknownParam: 'x' } });
      check(key, 'invalid', 'bad query never causes a 5xx', r.status < 500, {
        expected: '<500',
        actual: r.status < 500 ? r.status : { status: r.status, body: r.body },
      });
    } else if (method !== 'GET') {
      const r = await api(role, method, path, { headers: { 'content-type': 'application/json' }, form: '{"broken"' });
      check(key, 'invalid', 'malformed JSON gets a client error', [400, 401, 415].includes(r.status), {
        expected: '400',
        actual: [400, 401, 415].includes(r.status) ? r.status : { status: r.status, body: r.body },
      });
    }
  }
}
