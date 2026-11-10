'use strict';
// Only generated, loopback-published lab gateways may execute this fixed program.
// No destination is taken from a request, Host header, URL or forwarded header.
function program(kind, prefix) {
  if (!['sql', 'http'].includes(kind) || !['', 'target-'].includes(prefix))
    throw new Error('INVALID_LAB_BRIDGE');
  if (kind === 'sql')
    return `const net=require('node:net');
    const server=net.createServer(client=>{
      const upstream=net.connect(5432,${JSON.stringify(prefix + 'database')});
      client.setTimeout(30000,()=>client.destroy()); upstream.setTimeout(30000,()=>upstream.destroy());
      client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());
      client.on('close',()=>upstream.destroy());upstream.on('close',()=>client.destroy());
      client.pipe(upstream);upstream.pipe(client);
    });server.maxConnections=16;server.listen(8080,'0.0.0.0');`;
  return `const http=require('node:http');
    const routes=[['/auth/v1/',${JSON.stringify(prefix + 'auth')},9999],['/storage/v1/',${JSON.stringify(prefix + 'storage')},5000]];
    const server=http.createServer((req,res)=>{
      const route=routes.find(r=>req.url.startsWith(r[0]));
      if(!route||!['GET','POST','PUT','PATCH','DELETE'].includes(req.method)){res.writeHead(404);res.end();return;}
      const headers={...req.headers};delete headers.host;delete headers.connection;
      const proxy=http.request({hostname:route[1],port:route[2],method:req.method,path:'/'+req.url.slice(route[0].length),headers,timeout:10000},r=>{
        const h={...r.headers};delete h.connection;delete h['transfer-encoding'];res.writeHead(r.statusCode,h);r.pipe(res);
      });
      proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
      proxy.on('timeout',()=>proxy.destroy());req.on('aborted',()=>proxy.destroy());req.pipe(proxy);
    });server.on('connect',(q,s)=>s.destroy());server.on('upgrade',(q,s)=>s.destroy());
    server.listen(8080,'0.0.0.0');`;
}
async function waitForSqlGateway(
  url,
  password,
  assertOwned,
  { timeoutMs = 10000, intervalMs = 100, attemptMs = 1000 } = {},
) {
  const { Client } = require('pg');
  const parsed = new URL(url);
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    !parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    typeof password !== 'string' ||
    !/^[a-f0-9]{48}$/.test(password)
  )
    throw Error('Invalid owned SQL gateway');
  const deadline = Date.now() + timeoutMs;
  do {
    assertOwned();
    const client = new Client({
      host: '127.0.0.1',
      port: Number(parsed.port),
      database: 'postgres',
      user: 'supabase_admin',
      password,
      ssl: false,
      connectionTimeoutMillis: attemptMs,
      query_timeout: attemptMs,
    });
    try {
      await client.connect();
      const result = await client.query('SELECT 1 AS ready');
      if (result.rows.length === 1 && result.rows[0].ready === 1) return;
    } catch {
      /* A TCP proxy accepting/resetting is not PostgreSQL readiness. */
    } finally {
      await client.end().catch(() => {});
    }
    if (Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (Date.now() < deadline);
  throw Object.assign(Error('LAB_SQL_GATEWAY_NOT_READY'), {
    safeCode: 'LAB_SQL_GATEWAY_NOT_READY',
  });
}
module.exports = { program, waitForSqlGateway };
