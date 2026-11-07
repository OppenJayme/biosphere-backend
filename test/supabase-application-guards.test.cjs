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
        let stderr = '';
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
          resolve({ code, stderr });
        });
        child.stderr.on('data', (bytes) => {
          stderr += bytes;
        });
        child.stdout.resume();
        child.stdin.end(
          JSON.stringify({
            databaseUrl: `postgresql://supabase_admin:${'a'.repeat(48)}@127.0.0.1:${port}/postgres?schema=public`,
            supabaseUrl: `http://127.0.0.1:${port}`,
            serviceKey: 'synthetic',
            anonKey: 'synthetic',
            email: 'lab-00000000-0000-4000-8000-000000000001@example.invalid',
            password: 'a'.repeat(32),
          }),
        );
      });
      assert.equal(hits, 0);
      assert.equal(result.code, 1);
      assert.equal(
        result.stderr.trim(),
        'LAB_APPLICATION_CONFIGURATION_FAILED',
      );
    } finally {
      if (child && child.exitCode === null) child.kill();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
