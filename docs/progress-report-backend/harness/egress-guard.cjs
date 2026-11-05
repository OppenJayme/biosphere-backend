// Preloaded into the backend under test (node -r). Two jobs:
//  1. Hard network lock: any socket to a non-loopback address is refused, so
//     the audited server cannot reach hosted Supabase, Brevo or anything else.
//  2. Redirects the hardcoded Brevo URL to the local sink, so outbound email
//     paths run for real and their payloads can be inspected.
const net = require('node:net');
const fs = require('node:fs');

const LOG = process.env.AUDIT_EGRESS_LOG;
const SINK = process.env.AUDIT_BREVO_SINK; // e.g. http://127.0.0.1:18394/v3/smtp/email
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

function record(line) {
  if (LOG) fs.appendFileSync(LOG, `${new Date().toISOString()} ${line}\n`);
}

const realConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function guardedConnect(...args) {
  const first = Array.isArray(args[0]) ? args[0][0] : args[0];
  const host = typeof first === 'object' && first ? first.host : args[1];
  const isPipe = typeof first === 'object' && first && first.path;
  if (!isPipe && host && !LOOPBACK.has(String(host))) {
    record(`BLOCKED socket ${host}`);
    throw new Error(`audit egress guard: blocked connection to ${host}`);
  }
  return realConnect.apply(this, args);
};

const realFetch = globalThis.fetch;
globalThis.fetch = async function guardedFetch(input, init) {
  const url = new URL(typeof input === 'string' ? input : (input.url ?? input));
  if (url.hostname === 'api.brevo.com') {
    record('REDIRECTED brevo -> local sink');
    return realFetch(SINK, init);
  }
  if (!LOOPBACK.has(url.hostname)) {
    record(`BLOCKED fetch ${url.hostname}`);
    throw new Error(`audit egress guard: blocked fetch to ${url.hostname}`);
  }
  return realFetch(input, init);
};
