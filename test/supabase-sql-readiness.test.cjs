const { test } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');

test(
  'SQL readiness retries resets and never mistakes a listening TCP proxy for a ready database',
  { timeout: 10000 },
  async () => {
    const {
      waitForSqlGateway,
    } = require('../scripts/recovery/supabase-lab-bridge.cjs');
    let hits = 0;
    const server = net.createServer((socket) => {
      hits++;
      socket.destroy();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      await assert.rejects(
        () =>
          waitForSqlGateway(
            `http://127.0.0.1:${server.address().port}`,
            'a'.repeat(48),
            () => {},
            { timeoutMs: 1500, intervalMs: 30, attemptMs: 150 },
          ),
        { safeCode: 'LAB_SQL_GATEWAY_NOT_READY' },
      );
      assert.ok(hits > 1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
