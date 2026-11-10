/** Dependency regression at the Express HTTP boundary; no BioSphere auth or records. */
import { once } from 'node:events';
import express from 'express';
import request from 'supertest';

const forwardedClient = '198.51.100.66';

async function observedClient(trustSubnet?: string) {
  const app = express();
  if (trustSubnet) app.set('trust proxy', trustSubnet);
  app.get('/client-address', (req, res) =>
    res.json({ ip: req.ip, ips: req.ips }),
  );
  // A new ephemeral loopback listener per test. Never app ports 3000/3001.
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const response = await request(server)
      .get('/client-address')
      .set('X-Forwarded-For', forwardedClient)
      .expect(200);
    return response.body as { ip: string; ips: string[] };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

describe('Express proxy address trust', () => {
  it('ignores forwarded headers when proxy trust is not enabled', async () => {
    expect(await observedClient()).toEqual({ ip: '127.0.0.1', ips: [] });
  });

  it.each(['127.0.0.0/8', '::ffff:127.0.0.0/104'])(
    'retains explicitly trusted loopback subnet behavior for %s',
    async (subnet) => {
      expect(await observedClient(subnet)).toEqual({
        ip: forwardedClient,
        ips: [forwardedClient],
      });
    },
  );

  it('does not trust unrelated IPv4 peers through a short mapped-IPv6 prefix', async () => {
    expect(await observedClient('::ffff:10.0.0.0/8')).toEqual({
      ip: '127.0.0.1',
      ips: [],
    });
  });
});
