const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { spawn } = require('node:child_process');
const path = require('node:path');

test(
  'application checker refuses unowned loopback configuration without contacting it',
  { timeout: 25000 },
  async () => {
    require('../scripts/recovery/worker-build.cjs').verifyBuild();
    let hits = 0,
      child;
    const server = net.createServer((socket) => {
      hits++;
      socket.destroy();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    const apiServer = net.createServer((socket) => {
      hits++;
      socket.destroy();
    });
    await new Promise((resolve) => apiServer.listen(0, '127.0.0.1', resolve));
    const apiPort = apiServer.address().port;
    try {
      const result = await new Promise((resolve, reject) => {
        child = spawn(
          process.execPath,
          [
            path.resolve(
              __dirname,
              '../scripts/recovery/supabase-application-check.cjs',
            ),
          ],
          { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
        );
        let stderr = '',
          stdout = '';
        const timer = setTimeout(() => {
          child.kill();
          reject(new Error('Owned checker exceeded timeout'));
        }, 20000);
        child.on('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on('close', (code) => {
          clearTimeout(timer);
          resolve({ code, stderr, stdout });
        });
        child.stderr.on('data', (bytes) => {
          stderr += bytes;
        });
        child.stdout.on('data', (bytes) => {
          stdout += bytes;
        });
        child.stdin.end(
          JSON.stringify({
            databaseUrl: `postgresql://supabase_admin:${'a'.repeat(48)}@127.0.0.1:${port}/postgres?schema=public`,
            supabaseUrl: `http://127.0.0.1:${apiPort}`,
            serviceKey: 'synthetic',
            anonKey: 'synthetic',
            email: 'lab-00000000-0000-4000-8000-000000000001@example.invalid',
            password: 'a'.repeat(32),
            identity: {
              owner: '00000000-0000-4000-8000-000000000001',
              inside: '0'.repeat(64),
              outside: '1'.repeat(64),
              databaseId: '2'.repeat(64),
              sqlGatewayId: '3'.repeat(64),
              httpGatewayId: '4'.repeat(64),
              marker: '5'.repeat(64),
            },
          }),
        );
      });
      assert.equal(hits, 0);
      assert.equal(result.code, 1);
      const report =
        require('../scripts/recovery/supabase-application-result.cjs').readApplicationResult(
          {
            status: result.code,
            signal: null,
            stdout: result.stdout,
            stderr: result.stderr,
          },
        );
      assert.equal(report.code, 'LAB_APPLICATION_TARGET_IDENTITY_FAILED');
      assert.equal(report.cleanup, 'COMPLETE');
    } finally {
      if (child && child.exitCode === null) child.kill();
      await new Promise((resolve) => server.close(resolve));
      await new Promise((resolve) => apiServer.close(resolve));
    }
  },
);
