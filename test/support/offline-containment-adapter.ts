/** Test-only, permanently read-only adapter. It has no write-forwarding branch. */
import { createServer } from 'node:http';

export async function startOfflineContainmentAdapter(
  ownedBackendOrigin: string,
) {
  const backend = new URL(ownedBackendOrigin);
  if (
    backend.protocol !== 'http:' ||
    backend.hostname !== '127.0.0.1' ||
    !backend.port ||
    ['3000', '3001', '3002'].includes(backend.port) ||
    backend.username ||
    backend.password ||
    backend.pathname !== '/' ||
    backend.search ||
    backend.hash
  )
    throw new Error('Only an owned ephemeral loopback backend is supported.');

  const counts = { denied: 0, backendReads: 0 };
  let origin = '';
  const server = createServer((request, response) => {
    request.resume(); // Discard bodies; never log or forward them.
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    if (
      request.headers.host !== new URL(origin).host ||
      'authorization' in request.headers ||
      'cookie' in request.headers ||
      (request.headers.origin !== undefined &&
        request.headers.origin !== origin) ||
      request.method !== 'GET'
    ) {
      counts.denied++;
      response
        .writeHead(403)
        .end('{"message":"Containment preflight denies this request."}');
      return;
    }
    if (request.url === '/') {
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(
        '<!doctype html><title>Offline containment preflight</title><main id="root"></main>',
      );
    } else if (request.url === '/api/offline/specimens') {
      // Cache readback is deliberately outside this preflight; never pretend an empty list passed.
      response
        .writeHead(503)
        .end(
          '{"message":"Cache readback is disabled in containment preflight."}',
        );
    } else if (request.url === '/fixture/backend-check') {
      counts.backendReads++;
      // Destination, route and synthetic identity are fixed here, never taken from a request.
      void fetch(new URL('/audit-logs', backend), {
        headers: { Authorization: 'Bearer curator-fixture' },
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      })
        .then(async (upstream) => {
          await upstream.arrayBuffer();
          response
            .writeHead(upstream.ok ? 200 : 502)
            .end(JSON.stringify({ ready: upstream.ok }));
        })
        .catch(() => response.writeHead(502).end('{"ready":false}'));
    } else {
      counts.denied++;
      response.writeHead(404).end('{}');
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing loopback binding.');
  origin = `http://127.0.0.1:${address.port}`;
  if ([3000, 3001, 3002].includes(address.port)) {
    server.closeAllConnections();
    server.close();
    throw new Error('Application ports are forbidden.');
  }
  return {
    origin,
    snapshot: () => ({ ...counts }),
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
