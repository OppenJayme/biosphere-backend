'use strict';
// Explicit adapter for the synthetic transfer engine. No credential discovery,
// environment loading, retries, redirects, CLI or automatic engine wiring.
const https = require('node:https');
const MAX = 64 * 1024 ** 2;
function fail(code) {
  throw Object.assign(new Error(code), { code, safeCode: code });
}
function check(ok) {
  if (!ok) fail('B2_NATIVE_REQUEST_INVALID');
}
function prepare(input) {
  check(input && typeof input === 'object' && !Array.isArray(input));
  const fields = [
    'url',
    'method',
    'headers',
    'body',
    'timeoutMs',
    'maxResponseBytes',
    'followRedirects',
  ];
  check(Object.keys(input).every((k) => fields.includes(k)));
  check(
    input.followRedirects === false &&
      Number.isInteger(input.timeoutMs) &&
      input.timeoutMs > 0 &&
      input.timeoutMs <= 20000 &&
      Number.isInteger(input.maxResponseBytes) &&
      input.maxResponseBytes > 0 &&
      input.maxResponseBytes <= MAX,
  );
  check(
    typeof input.url === 'string' &&
      input.url.length <= 2048 &&
      !/[\s\\]/.test(input.url),
  );
  let url;
  try {
    url = new URL(input.url);
  } catch {
    fail('B2_NATIVE_REQUEST_INVALID');
  }
  check(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash,
  );
  const metadata =
    /^api[0-9]+\.backblazeb2\.com$/.test(url.hostname) &&
    /^\/b2api\/v4\/(b2_list_buckets|b2_get_upload_url|b2_get_file_info)$/.test(
      url.pathname,
    ) &&
    !url.search;
  const download =
    /^f[0-9]+\.backblazeb2\.com$/.test(url.hostname) &&
    url.pathname === '/b2api/v4/b2_download_file_by_id' &&
    /^\?fileId=[A-Za-z0-9_-]{1,256}$/.test(url.search);
  const authorize =
    url.hostname === 'api.backblazeb2.com' &&
    url.pathname === '/b2api/v4/b2_authorize_account' &&
    !url.search;
  const noBody = download || authorize;
  const upload =
    /^pod-[0-9]+(?:-[0-9]+)*\.(backblaze|backblazeb2)\.com$/.test(
      url.hostname,
    ) &&
    ((/^\/b2api\/v4\/b2_upload_file\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,256}$/.test(
      url.pathname,
    ) &&
      !url.search) ||
      (url.pathname === '/b2api/v4/b2_upload_file' &&
        url.search.slice(1).split('&').length === 2 &&
        url.search
          .slice(1)
          .split('&')
          .every((p) => /^(bucket|cvt)=[A-Za-z0-9_-]{1,256}$/.test(p)) &&
        url.searchParams.getAll('bucket').length === 1 &&
        url.searchParams.getAll('cvt').length === 1));
  check(
    (noBody && input.method === 'GET') ||
      ((metadata || upload) && input.method === 'POST'),
  );
  check(download || upload || input.maxResponseBytes <= 65536);
  if (upload) check(input.maxResponseBytes <= 65536);
  if (typeof input.body === 'string')
    check(Buffer.byteLength(input.body) <= (upload ? MAX : 65536));
  const body = Buffer.isBuffer(input.body)
    ? input.body
    : typeof input.body === 'string'
      ? Buffer.from(input.body)
      : input.body === undefined
        ? undefined
        : null;
  check(
    body !== null &&
      (noBody
        ? body === undefined
        : Buffer.isBuffer(body) &&
          body.length > 0 &&
          body.length <= (upload ? MAX : 65536)),
  );
  const canonical = {
    authorization: 'Authorization',
    'content-type': 'Content-Type',
    'content-length': 'Content-Length',
    'x-bz-file-name': 'X-Bz-File-Name',
    'x-bz-content-sha1': 'X-Bz-Content-Sha1',
    'x-bz-file-retention-mode': 'X-Bz-File-Retention-Mode',
    'x-bz-file-retention-retain-until-timestamp':
      'X-Bz-File-Retention-Retain-Until-Timestamp',
  };
  check(
    input.headers &&
      typeof input.headers === 'object' &&
      !Array.isArray(input.headers),
  );
  const headers = {};
  for (const [key, value] of Object.entries(input.headers)) {
    const name = canonical[key.toLowerCase()];
    check(
      typeof name === 'string' &&
        !(name in headers) &&
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 8192 &&
        !Array.from(value).some(
          (c) => c.charCodeAt(0) <= 31 || c.charCodeAt(0) === 127,
        ),
    );
    headers[name] = value;
  }
  check(typeof headers.Authorization === 'string');
  const allowed = upload
    ? Object.values(canonical)
    : noBody
      ? ['Authorization']
      : ['Authorization', 'Content-Type', 'Content-Length'];
  check(Object.keys(headers).every((name) => allowed.includes(name)));
  if (authorize)
    check(/^Basic [A-Za-z0-9+/]+={0,2}$/.test(headers.Authorization));
  if (body) {
    check(
      headers['Content-Length'] === undefined ||
        headers['Content-Length'] === String(body.length),
    );
    headers['Content-Length'] = String(body.length);
    check(
      headers['Content-Type'] ===
        (upload ? 'application/octet-stream' : 'application/json'),
    );
  }
  if (upload) {
    check(
      typeof headers['X-Bz-File-Name'] === 'string' &&
        /^[A-Za-z0-9_/%.-]+$/.test(headers['X-Bz-File-Name']),
    );
    check(
      /^[a-f0-9]{40}$/.test(headers['X-Bz-Content-Sha1'] ?? '') &&
        headers['X-Bz-File-Retention-Mode'] === 'governance',
    );
    const until = Number(headers['X-Bz-File-Retention-Retain-Until-Timestamp']);
    check(
      /^\d{1,16}$/.test(
        headers['X-Bz-File-Retention-Retain-Until-Timestamp'] ?? '',
      ) &&
        Number.isSafeInteger(until) &&
        until > Date.now() &&
        until - Date.now() <= 86400000,
    );
  }
  return {
    url,
    body,
    headers,
    method: input.method,
    timeoutMs: input.timeoutMs,
    maxResponseBytes: input.maxResponseBytes,
  };
}
async function requestB2(input) {
  const prepared = prepare(input);
  return new Promise((resolve, reject) => {
    let request,
      response,
      timer,
      buffer,
      settled = false;
    const stop = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (buffer) buffer.fill(0);
      buffer = undefined;
      response?.destroy();
      request?.destroy();
      reject(
        Object.assign(new Error('B2_NATIVE_HTTP_FAILED'), {
          code: 'B2_NATIVE_HTTP_FAILED',
          safeCode: 'B2_NATIVE_HTTP_FAILED',
        }),
      );
    };
    // A socket-idle timeout alone does not abort a request, and a slow drip can
    // keep it alive indefinitely. This deadline covers all request phases.
    timer = setTimeout(stop, prepared.timeoutMs);
    timer.unref?.();
    try {
      request = https.request(
        prepared.url,
        {
          method: prepared.method,
          headers: prepared.headers,
          agent: false,
          rejectUnauthorized: true,
          maxHeaderSize: 16384,
        },
        (res) => {
          response = res;
          res.on('error', stop);
          res.on('aborted', stop);
          res.on('close', () => {
            if (!settled) stop();
          });
          if (settled) {
            res.destroy();
            return;
          }
          if (
            res.statusCode !== 200 ||
            (res.headers['content-encoding'] !== undefined &&
              res.headers['content-encoding'] !== 'identity')
          ) {
            stop();
            return;
          }
          const length = res.headers['content-length'];
          let declared,
            total = 0;
          if (length !== undefined) {
            if (
              typeof length !== 'string' ||
              !/^\d{1,10}$/.test(length) ||
              Number(length) > prepared.maxResponseBytes
            ) {
              stop();
              return;
            }
            declared = Number(length);
          }
          const capacity = declared ?? prepared.maxResponseBytes;
          try {
            buffer = Buffer.alloc(capacity);
          } catch {
            stop();
            return;
          }
          res.on('data', (chunk) => {
            if (settled) return;
            if (!Buffer.isBuffer(chunk) || total + chunk.length > capacity) {
              stop();
              return;
            }
            chunk.copy(buffer, total);
            total += chunk.length;
          });
          res.on('end', () => {
            if (settled) return;
            if (
              res.complete !== true ||
              (declared !== undefined && declared !== total)
            ) {
              stop();
              return;
            }
            settled = true;
            clearTimeout(timer);
            const body = buffer.subarray(0, total);
            buffer = undefined;
            resolve({ status: res.statusCode, headers: res.headers, body });
          });
        },
      );
      request.on('error', stop);
      request.on('close', () => {
        if (!response) stop();
      });
      request.end(prepared.body);
    } catch {
      stop();
    }
  });
}
module.exports = { requestB2 };
