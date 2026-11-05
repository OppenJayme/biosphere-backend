// Resets the disposable database and creates synthetic accounts. All addresses
// use the reserved .invalid/example domains. assertSafeTarget() runs first.
import { randomBytes } from 'node:crypto';
import { gotrue, ids, signIn, sql, tokens } from './lib.mjs';

export const password = () => `Aa1!${randomBytes(12).toString('hex')}`;
export const accounts = {};

export async function resetDatabase() {
  const tables = await sql(
    "select tablename from pg_tables where schemaname='public'",
  );
  await sql(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(',')} RESTART IDENTITY CASCADE`);
  const users = await gotrue('GET', '/admin/users?per_page=1000');
  for (const user of users.body?.users ?? []) {
    await gotrue('DELETE', `/admin/users/${user.id}`);
  }
}

async function makeUser(key, role, fullName, status = 'ACTIVE') {
  const email = `${key}@audit.example.invalid`;
  const secret = password();
  const created = await gotrue('POST', '/admin/users', {
    email,
    password: secret,
    email_confirm: true,
    app_metadata: { role },
  });
  if (created.status >= 300) throw new Error(`seed ${key}: ${JSON.stringify(created.body)}`);
  const row = (
    await sql(
      `insert into user_account(auth_user_id, full_name, role, status)
       values ($1,$2,$3,$4) returning id`,
      [created.body.id, fullName, role, status],
    )
  )[0];
  accounts[key] = { email, password: secret, authId: created.body.id, accountId: row.id };
  ids[key] = row.id;
}

export async function seedAccounts() {
  await makeUser('curator', 'CURATOR', 'Audit Curator');
  await makeUser('curator2', 'CURATOR', 'Audit Second Curator');
  await makeUser('developer', 'DEVELOPER', 'Audit Developer');
  await makeUser('inactive', 'CURATOR', 'Audit Inactive Curator', 'INACTIVE');
  for (const key of ['curator', 'curator2', 'developer', 'inactive']) {
    const session = await signIn(accounts[key].email, accounts[key].password);
    if (!session?.access_token) throw new Error(`no session for ${key}`);
    tokens[key] = session.access_token;
    accounts[key].refresh = session.refresh_token;
  }
}
