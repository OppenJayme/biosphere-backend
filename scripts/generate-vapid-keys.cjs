// Prints a new VAPID key pair for Web Push (spec 0004). Paste the output into
// the server's .env only; never commit it or share the private key.
const { generateKeyPairSync } = require('node:crypto');

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const publicKey = Buffer.concat([
  Buffer.from([0x04]),
  Buffer.from(jwk.x, 'base64url'),
  Buffer.from(jwk.y, 'base64url'),
]).toString('base64url');

console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
