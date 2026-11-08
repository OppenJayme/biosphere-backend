'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '../..');
let checkout;
function guardCheckout() {
  if (checkout) return checkout;
  require('../../scripts/recovery/worker-build.cjs').verifyBuild();
  checkout = fs.mkdtempSync(
    path.join(os.tmpdir(), 'biosphere-guard-checkout-'),
  );
  // Copy only source/build inputs, never an existing .env, .git or local evidence.
  for (const name of [
    'src',
    'dist',
    'prisma',
    'prisma.config.ts',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'tsconfig.build.json',
    'nest-cli.json',
    'scripts/recovery',
  ]) {
    const target = path.resolve(checkout, name);
    if (!target.startsWith(path.resolve(checkout) + path.sep))
      throw new Error('Unsafe guard fixture path');
    fs.cpSync(path.join(root, name), target, {
      recursive: true,
      filter: (p) =>
        !path.basename(p).startsWith('.env') &&
        !fs.lstatSync(p).isSymbolicLink(),
    });
  }
  fs.symlinkSync(
    fs.realpathSync(path.join(root, 'node_modules')),
    path.join(checkout, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  fs.writeFileSync(
    path.join(checkout, '.env'),
    'DATABASE_URL=postgresql://synthetic@127.0.0.1:1/do_not_read\nSUPABASE_URL=https://example.invalid\n',
    { flag: 'wx', mode: 0o600 },
  );
  return checkout;
}
module.exports = { guardCheckout };
