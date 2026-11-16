import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto';
import { parseVapidKeys, vapidAuthorization } from './vapid';

function newKeys() {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const jwk = privateKey.export({ format: 'jwk' });
  const publicKey = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x!, 'base64url'),
    Buffer.from(jwk.y!, 'base64url'),
  ]).toString('base64url');
  return { publicKey, privateKey: jwk.d!, jwk };
}

describe('VAPID', () => {
  const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';
  const NOW = new Date('2026-11-16T10:00:00.000Z');

  it('signs a token the public key verifies, scoped to the push service origin', () => {
    const generated = newKeys();
    const keys = parseVapidKeys(
      generated.publicKey,
      generated.privateKey,
      'mailto:museum@example.com',
    );
    expect(keys).not.toBeNull();

    const header = vapidAuthorization(keys!, ENDPOINT, NOW);
    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, head, body, signature, k] = match!;
    expect(k).toBe(generated.publicKey);
    expect(JSON.parse(Buffer.from(head, 'base64url').toString())).toEqual({
      typ: 'JWT',
      alg: 'ES256',
    });
    expect(JSON.parse(Buffer.from(body, 'base64url').toString())).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: Math.floor(NOW.getTime() / 1000) + 12 * 60 * 60,
      sub: 'mailto:museum@example.com',
    });

    const publicKey = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x: generated.jwk.x, y: generated.jwk.y },
      format: 'jwk',
    });
    expect(
      verify(
        'sha256',
        Buffer.from(`${head}.${body}`),
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signature, 'base64url'),
      ),
    ).toBe(true);
  });

  it('rejects missing, malformed or mismatched keys and a bad subject', () => {
    const a = newKeys();
    const b = newKeys();
    const subject = 'mailto:museum@example.com';
    expect(parseVapidKeys(undefined, a.privateKey, subject)).toBeNull();
    expect(parseVapidKeys(a.publicKey, '', subject)).toBeNull();
    expect(parseVapidKeys('not-a-key', a.privateKey, subject)).toBeNull();
    expect(parseVapidKeys(a.publicKey, b.privateKey, subject)).toBeNull();
    expect(parseVapidKeys(a.publicKey, a.privateKey, 'museum')).toBeNull();
    expect(
      parseVapidKeys(a.publicKey, a.privateKey, 'https://museum.example'),
    ).not.toBeNull();
  });
});
