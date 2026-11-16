import {
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
  type KeyObject,
} from 'node:crypto';

// VAPID (RFC 8292) identifies BioSphere to browser push services. Keys use the
// usual Web Push encoding: the public key is the 65-byte uncompressed P-256
// point and the private key the 32-byte scalar, both base64url.

export interface VapidKeys {
  publicKey: string;
  privateKey: KeyObject;
  subject: string;
}

// Tokens are valid for 12 hours; push services reject anything over 24.
const TOKEN_TTL_SECONDS = 12 * 60 * 60;

export function parseVapidKeys(
  publicKey: string | undefined,
  privateKey: string | undefined,
  subject: string | undefined,
): VapidKeys | null {
  const pub = publicKey?.trim();
  const priv = privateKey?.trim();
  const sub = subject?.trim();
  if (!pub || !priv || !sub) return null;
  if (!/^(mailto:|https:\/\/)/.test(sub)) return null;

  const point = Buffer.from(pub, 'base64url');
  const scalar = Buffer.from(priv, 'base64url');
  if (point.length !== 65 || point[0] !== 0x04 || scalar.length !== 32) {
    return null;
  }
  const x = point.subarray(1, 33).toString('base64url');
  const y = point.subarray(33).toString('base64url');
  try {
    const key = createPrivateKey({
      key: { kty: 'EC', crv: 'P-256', x, y, d: scalar.toString('base64url') },
      format: 'jwk',
    });
    // Node does not check that d matches x/y. A mismatched pair would make
    // every push service reject every push, so refuse it at startup.
    const probe = Buffer.from('biosphere-vapid-check');
    const signature = sign('sha256', probe, key);
    const publicKey = createPublicKey({
      key: { kty: 'EC', crv: 'P-256', x, y },
      format: 'jwk',
    });
    if (!verify('sha256', probe, publicKey, signature)) return null;
    return { publicKey: pub, privateKey: key, subject: sub };
  } catch {
    return null;
  }
}

// The Authorization header for one push service origin.
export function vapidAuthorization(
  keys: VapidKeys,
  endpoint: string,
  now = new Date(),
): string {
  const header = encode({ typ: 'JWT', alg: 'ES256' });
  const claims = encode({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS,
    sub: keys.subject,
  });
  const unsigned = `${header}.${claims}`;
  const signature = sign('sha256', Buffer.from(unsigned), {
    key: keys.privateKey,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `vapid t=${unsigned}.${signature}, k=${keys.publicKey}`;
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}
