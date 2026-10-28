/** Owned-test-only bridge: one exact synthetic draft, at most two same-ID forwards. */
import { createServer, type ServerResponse } from 'node:http';

const EXPECTED_DRAFT = {
  collectionId: null,
  accessionNumber: null,
  specimenCategory: 'Testing',
  commonName: 'TEST Owned Lost Response',
  scientificName: 'Testus recoverus',
  gender: 'UNKNOWN',
  classificationStatus: null,
  remarks: 'Synthetic recovery fixture only',
};
type BackendResult = {
  clientDraftId: string;
  alreadySynchronized: boolean;
  specimen: {
    id: string;
    commonName: string;
    status: string;
    publicDisplay: boolean;
  };
};

export async function startOfflineRecoveryAdapter(ownedBackendOrigin: string) {
  const backend = new URL(ownedBackendOrigin);
  if (
    backend.protocol !== 'http:' ||
    backend.hostname !== '127.0.0.1' ||
    !backend.port ||
    ['3000', '3001', '3002'].includes(backend.port) ||
    backend.href !== `${backend.origin}/`
  ) {
    throw new Error('Only an owned ephemeral loopback backend is supported.');
  }
  const state = {
    forwarded: 0,
    denied: 0,
    committed: false,
    firstClosed: false,
    holdExpired: false,
    retryAlreadySynchronized: false,
    clientDraftId: null as string | null,
    specimenId: null as string | null,
  };
  const held = new Set<ServerResponse>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let origin = '';
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', 'application/json');
    response.setHeader(
      'Content-Security-Policy',
      // Zod's real runtime schema compiler uses new Function. Fixture-only; not an app CSP change.
      "default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    const deny = (status: number) => {
      state.denied++;
      request.resume();
      response
        .writeHead(status)
        .end('{"message":"Owned recovery fixture rejected the request."}');
    };
    if (
      request.headers.host !== new URL(origin).host ||
      'authorization' in request.headers ||
      'cookie' in request.headers ||
      (request.headers.origin !== undefined &&
        request.headers.origin !== origin)
    ) {
      deny(403);
      return;
    }
    if (request.method === 'GET' && request.url === '/') {
      request.resume();
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.end(
        '<!doctype html><title>Owned offline recovery</title><main id="root"></main>',
      );
    } else if (request.method === 'GET' && request.url === '/fixture/state') {
      request.resume();
      response.end(JSON.stringify(state));
    } else if (
      request.method === 'GET' &&
      request.url === '/api/offline/specimens'
    ) {
      request.resume();
      response
        .writeHead(503)
        .end('{"message":"Cache listing is outside this fixture."}');
    } else if (
      request.method === 'POST' &&
      request.url === '/api/offline/specimen-drafts'
    ) {
      void (async () => {
        let body = '';
        for await (const chunk of request) {
          body += String(chunk);
          if (Buffer.byteLength(body) > 8192) {
            deny(413);
            return;
          }
        }
        let value: { clientDraftId?: unknown; draft?: unknown };
        try {
          value = JSON.parse(body) as typeof value;
        } catch {
          deny(400);
          return;
        }
        if (
          !value ||
          typeof value !== 'object' ||
          Object.keys(value).length !== 2 ||
          typeof value.clientDraftId !== 'string' ||
          !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
            value.clientDraftId,
          ) ||
          !value.draft ||
          typeof value.draft !== 'object'
        ) {
          deny(400);
          return;
        }
        const draft = value.draft as Record<string, unknown>;
        if (
          Object.keys(draft).length !== Object.keys(EXPECTED_DRAFT).length ||
          Object.entries(EXPECTED_DRAFT).some(
            ([key, expected]) => draft[key] !== expected,
          )
        ) {
          deny(400);
          return;
        }
        if (
          state.forwarded >= 2 ||
          (state.clientDraftId !== null &&
            (state.clientDraftId !== value.clientDraftId ||
              !state.firstClosed ||
              !state.committed))
        ) {
          deny(409);
          return;
        }
        const attempt = ++state.forwarded;
        state.clientDraftId = value.clientDraftId;
        const upstream = await fetch(
          new URL('/offline-sync/specimen-drafts', backend),
          {
            method: 'POST',
            headers: {
              Authorization: 'Bearer curator-fixture',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(value),
            redirect: 'error',
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!upstream.ok)
          throw new Error('Owned backend did not accept the synthetic draft');
        const result = (await upstream.json()) as BackendResult;
        if (
          result.clientDraftId !== value.clientDraftId ||
          !result.specimen?.id ||
          result.specimen.commonName !== EXPECTED_DRAFT.commonName ||
          result.specimen.status !== 'UNCATALOGED' ||
          result.specimen.publicDisplay !== false ||
          result.alreadySynchronized !== (attempt === 2) ||
          (attempt === 2 && result.specimen.id !== state.specimenId)
        ) {
          throw new Error(
            'Owned backend response failed the recovery contract',
          );
        }
        if (attempt === 1) {
          state.specimenId = result.specimen.id;
          state.committed = true; // Real successful Nest response: transaction has committed.
          held.add(response); // Do not send headers or body to the browser.
          const timer = setTimeout(() => {
            state.holdExpired = true;
            response.destroy();
          }, 30000);
          timers.add(timer);
          response.once('close', () => {
            state.firstClosed = true;
            held.delete(response);
            clearTimeout(timer);
            timers.delete(timer);
          });
        } else {
          state.retryAlreadySynchronized = result.alreadySynchronized;
          response.end(JSON.stringify(result));
        }
      })().catch(() => {
        if (!response.destroyed)
          response
            .writeHead(502)
            .end('{"message":"Owned recovery bridge failed."}');
      });
    } else deny(404);
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing owned binding');
  origin = `http://127.0.0.1:${address.port}`;
  if ([3000, 3001, 3002].includes(address.port)) {
    server.closeAllConnections();
    server.close();
    throw new Error('Application ports are forbidden');
  }
  return {
    origin,
    snapshot: () => ({ ...state }),
    async close() {
      for (const timer of timers) clearTimeout(timer);
      for (const response of held) response.destroy();
      server.closeAllConnections();
      await new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      );
    },
  };
}
