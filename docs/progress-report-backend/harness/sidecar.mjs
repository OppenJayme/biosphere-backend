// Loopback-only helpers for the audit stack:
//   :18397  Supabase-shaped gateway (/auth/v1 -> GoTrue, /storage/v1 -> Storage)
//   :18394  Brevo sink: stores each email; GET /sent lists them, DELETE /sent
//           clears them, POST /mode {"fail":true} makes sends return 500.
import http from 'node:http';

const targets = [
  ['/auth/v1', 18396],
  ['/storage/v1', 18395],
];

http
  .createServer((req, res) => {
    const match = targets.find(([prefix]) => req.url.startsWith(prefix));
    if (!match) {
      res.writeHead(404).end('{"message":"no route"}');
      return;
    }
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: match[1],
        method: req.method,
        path: req.url.slice(match[0].length) || '/',
        headers: { ...req.headers, host: '127.0.0.1' },
      },
      (reply) => {
        res.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(res);
      },
    );
    upstream.on('error', (error) => {
      res.writeHead(502).end(JSON.stringify({ message: error.message }));
    });
    req.pipe(upstream);
  })
  .listen(18397, '127.0.0.1');

let sent = [];
let fail = false;
const body = (req) =>
  new Promise((done) => {
    const parts = [];
    req.on('data', (part) => parts.push(part));
    req.on('end', () => done(Buffer.concat(parts).toString('utf8')));
  });

http
  .createServer(async (req, res) => {
    const json = (code, value) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (req.url === '/sent' && req.method === 'GET') return json(200, sent);
    if (req.url === '/sent' && req.method === 'DELETE') {
      sent = [];
      return json(200, {});
    }
    if (req.url === '/mode') {
      fail = JSON.parse(await body(req)).fail === true;
      return json(200, { fail });
    }
    const email = JSON.parse(await body(req));
    if (fail) return json(500, { message: 'audit sink forced failure' });
    sent.push(email);
    return json(201, { messageId: `<audit-${sent.length}@local>` });
  })
  .listen(18394, '127.0.0.1');

console.log('sidecar ready');
