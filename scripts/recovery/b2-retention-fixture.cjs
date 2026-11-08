'use strict';
// Internal, synthetic-only codec. Secrets travel over stdin/stdout pipes captured
// by the PowerShell runner, never command arguments, environment or files here.
const crypto = require('node:crypto');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  if (Buffer.byteLength(input) > 4096) process.exit(1);
});
process.stdin.on('end', () => {
  try {
    const request = JSON.parse(input);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        request.runId,
      )
    )
      throw Error();
    const plaintext = Buffer.from(
      JSON.stringify({
        format: 'biosphere-b2-retention-fixture-v1',
        runId: request.runId,
        message: 'Synthetic test only. No museum or account data.',
      }),
    );
    const digest = (bytes) =>
      crypto.createHash('sha256').update(bytes).digest('hex');
    const magic = Buffer.from('B2RET001');
    if (request.command === 'create') {
      const key = crypto.randomBytes(32),
        iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(magic);
      const ciphertext = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      const envelope = Buffer.concat([
        magic,
        iv,
        cipher.getAuthTag(),
        ciphertext,
      ]);
      if (envelope.length > 1024) throw Error();
      process.stdout.write(
        JSON.stringify({
          key: key.toString('base64'),
          envelope: envelope.toString('base64'),
          sha256: digest(envelope),
        }),
      );
    } else if (request.command === 'verify') {
      const key = Buffer.from(request.key, 'base64'),
        envelope = Buffer.from(request.envelope, 'base64');
      if (
        key.length !== 32 ||
        envelope.length < 37 ||
        envelope.length > 1024 ||
        !envelope.subarray(0, 8).equals(magic)
      )
        throw Error();
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        envelope.subarray(8, 20),
      );
      decipher.setAAD(magic);
      decipher.setAuthTag(envelope.subarray(20, 36));
      const restored = Buffer.concat([
        decipher.update(envelope.subarray(36)),
        decipher.final(),
      ]);
      if (!restored.equals(plaintext)) throw Error();
      process.stdout.write(
        JSON.stringify({ verified: true, sha256: digest(envelope) }),
      );
    } else throw Error();
  } catch {
    process.stderr.write('SYNTHETIC_FIXTURE_REJECTED');
    process.exitCode = 1;
  }
});
