// SRS 4.1 (authentication, curator accounts) and the account half of 4.2.
import {
  anonHeaders, api, auditRow, call, check, emails, gotrue, ids, info, mailpit, one, section,
  signIn, sleep, sql, tokens, UNKNOWN_ID,
} from '../lib.mjs';
import { accounts, password } from '../seed.mjs';
import { routes } from './00-auth-matrix.mjs';

async function inviteToken(email) {
  for (let i = 0; i < 25; i += 1) {
    const list = await mailpit.messages();
    const hit = list.find((m) => m.To?.some((to) => to.Address === email));
    if (hit) {
      const full = await mailpit.body(hit.ID);
      const text = `${full.Text ?? ''} ${full.HTML ?? ''}`;
      const match = text.match(/token=([a-zA-Z0-9_-]+)/);
      return { token: match?.[1], text };
    }
    await sleep(200);
  }
  return {};
}

const verifyInvite = (token, type = 'invite') =>
  gotrue('POST', '/verify', { type, token_hash: token }, anonHeaders());

const hasRoute = (pattern) =>
  (routes.length ? routes : []).some((r) => pattern.test(`${r.method} ${r.path}`));

export default async function run() {
  await mailpit.clear();
  const curator = accounts.curator;

  // ---- Login -------------------------------------------------------------
  section('4.1 Authentication and accounts', ['REQ-4.1-01', 'REQ-4.1-04']);
  const login = await call('curator logs in', 'happy', 'none', 'POST', '/auth/login', [200, 201], {
    json: { email: curator.email, password: curator.password },
  });
  check('POST /auth/login', 'shape', 'response has tokens and the account', Boolean(
    login.body?.access_token && login.body?.refresh_token && login.body?.user?.role === 'CURATOR',
  ), { expected: 'access_token, refresh_token, user.role', actual: Object.keys(login.body ?? {}) });
  const me = await call('session opens /auth/me', 'happy', login.body?.access_token, 'GET', '/auth/me', 200);
  check('GET /auth/me', 'shape', 'profile fields', me.body?.email === curator.email && me.body?.fullName === 'Audit Curator' && me.body?.role === 'CURATOR', {
    expected: 'email, fullName, role', actual: me.body,
  });

  section('4.1 Authentication and accounts', ['REQ-4.1-15', 'REQ-4.15-01']);
  const success = await auditRow('LOGIN', { status: 'SUCCESS', user_id: ids.curator });
  check('POST /auth/login', 'db', 'successful login audited', Boolean(success), { expected: 'audit_log LOGIN SUCCESS', actual: success ?? null });
  check('POST /auth/login', 'db', 'audit details hold no secret', !/password|token/i.test(JSON.stringify(success?.details ?? {})) && !JSON.stringify(success ?? {}).includes(curator.password), {
    expected: 'no password or token', actual: success?.details ?? null,
  });

  section('4.1 Authentication and accounts', ['REQ-4.1-01', 'REQ-4.1-15']);
  const wrong = await call('wrong password refused', 'invalid', 'none', 'POST', '/auth/login', 401, {
    json: { email: curator.email, password: 'wrong-password' },
  });
  const unknown = await call('unknown email refused', 'invalid', 'none', 'POST', '/auth/login', 401, {
    json: { email: 'nobody@audit.example.invalid', password: 'wrong-password' },
  });
  check('POST /auth/login', 'shape', 'same message for wrong password and unknown email', wrong.body?.message === unknown.body?.message, {
    expected: 'identical', actual: [wrong.body?.message, unknown.body?.message], srs: ['REQ-4.1-10', 'REQ-4.1-15'],
  });
  const failed = await auditRow('LOGIN', { status: 'FAILED' });
  check('POST /auth/login', 'db', 'failed login audited without password', Boolean(failed) && !JSON.stringify(failed).includes('wrong-password'), {
    expected: 'audit_log LOGIN FAILED', actual: failed?.details ?? null,
  });

  section('4.1 Authentication and accounts', ['REQ-4.1-12']);
  await call('inactive account refused at login', 'invalid', 'none', 'POST', '/auth/login', [401, 403], {
    json: { email: accounts.inactive.email, password: accounts.inactive.password },
  });
  const deniedLogin = await auditRow('LOGIN', { status: 'DENIED' });
  check('POST /auth/login', 'db', 'inactive login audited as denied', Boolean(deniedLogin), {
    expected: 'audit_log LOGIN DENIED', actual: deniedLogin ?? null, srs: ['REQ-4.1-15'],
  });

  section('4.1 Authentication and accounts', ['REQ-4.1-01']);
  const empty = await api('none', 'POST', '/auth/login', { json: {}, keep429: true });
  check('POST /auth/login', 'invalid', 'empty login body gets a client error, not a 500', [400, 401, 429].includes(empty.status), {
    expected: '400|401', actual: { status: empty.status, body: empty.body },
  });
  let limited = 0;
  for (let i = 0; i < 7; i += 1) {
    const r = await api('none', 'POST', '/auth/login', { json: { email: curator.email, password: 'x' }, keep429: true });
    if (r.status === 429) limited += 1;
  }
  check('POST /auth/login', 'invalid', 'login rate limit engages', limited > 0, { expected: '429 after 5 per minute', actual: limited });

  // ---- Registration, logout, password surface ----------------------------
  section('4.1 Authentication and accounts', ['REQ-4.1-03']);
  check('routes', 'absence', 'no public registration route exists', !hasRoute(/register|signup|sign-up/i), { expected: 'none', actual: routes.filter((r) => /register|signup/i.test(r.path)) });
  const signup = await gotrue('POST', '/signup', { email: 'self@audit.example.invalid', password: password() }, anonHeaders());
  check('auth provider', 'invalid', 'provider refuses self-signup when disabled', signup.status >= 400, {
    expected: '4xx', actual: signup.status, note: 'Local GoTrue has signup disabled; the hosted project setting was not read.',
  });

  section('4.1 Authentication and accounts', ['REQ-4.1-05']);
  const session = await signIn(accounts.curator2.email, accounts.curator2.password);
  await call('session valid before logout', 'happy', session.access_token, 'GET', '/auth/me', 200);
  const out = await gotrue('POST', '/logout?scope=local', undefined, anonHeaders({ authorization: `Bearer ${session.access_token}` }));
  check('auth provider', 'happy', 'provider logout accepted', out.status === 204, { expected: 204, actual: out.status });
  await call('token refused after logout', 'happy', session.access_token, 'GET', '/auth/me', 401);
  info('routes', 'logout has no backend route', {
    expected: 'session ends after logout',
    actual: 'ends through the provider, proven above; backend records no logout event',
  });
  info('code', 'inactivity timeout is enforced by the frontend', {
    expected: 'sign-out after the approved period',
    actual: 'proxy.ts and InactivityGuard; not testable through this API harness',
    srs: ['REQ-4.1-05'],
  });

  section('4.1 Authentication and accounts', ['REQ-4.1-16']);
  check('routes', 'absence', 'authenticated change-password operation exists', hasRoute(/password/i), {
    expected: 'change-password route', actual: 'none',
  });
  section('4.1 Authentication and accounts', ['REQ-4.1-18']);

  // ---- Curator-to-curator invitation -------------------------------------
  section('4.1 Authentication and accounts', ['REQ-4.1-02', 'REQ-4.1-07']);
  const invitee = 'invitee@audit.example.invalid';
  const invited = await call('curator invites curator', 'happy', 'curator', 'POST', '/user-accounts/invitations', 201, {
    json: { email: invitee, fullName: 'Audit Invitee' },
  });
  const row = await one("select ua.*, u.email from user_account ua join auth.users u on u.id = ua.auth_user_id where u.email = $1", [invitee]);
  check('POST /user-accounts/invitations', 'db', 'separate CURATOR account stored', row?.role === 'CURATOR' && row?.full_name === 'Audit Invitee', {
    expected: 'user_account CURATOR', actual: row ? { role: row.role, status: row.status } : null,
  });
  check('POST /user-accounts/invitations', 'shape', 'response has the summary fields', Boolean(invited.body?.id && invited.body?.email === invitee && 'inviteAccepted' in (invited.body ?? {})), {
    expected: 'id, email, inviteAccepted', actual: invited.body,
  });
  const audited = await auditRow('INVITE_CURATOR', { status: 'SUCCESS' });
  check('POST /user-accounts/invitations', 'db', 'invitation audited with no secret', Boolean(audited) && !/token|password/i.test(JSON.stringify(audited?.details ?? {})), {
    expected: 'audit_log INVITE_CURATOR', actual: audited?.details ?? null, srs: ['REQ-4.1-11'],
  });
  await call('duplicate invite conflicts', 'invalid', 'curator', 'POST', '/user-accounts/invitations', 409, { json: { email: invitee, fullName: 'Again' } });
  await call('malformed email rejected', 'invalid', 'curator', 'POST', '/user-accounts/invitations', 400, { json: { email: 'nope', fullName: 'X' } });
  await call('missing name rejected', 'invalid', 'curator', 'POST', '/user-accounts/invitations', 400, { json: { email: 'a@audit.example.invalid' } });
  await call('unknown field rejected', 'invalid', 'curator', 'POST', '/user-accounts/invitations', 400, { json: { email: 'b@audit.example.invalid', fullName: 'X', role: 'DEVELOPER' } });

  const list = await call('list curators', 'happy', 'curator', 'GET', '/user-accounts', 200);
  check('GET /user-accounts', 'shape', 'curator view hides developer accounts', Array.isArray(list.body) && !list.body.some((a) => a.email === accounts.developer.email), {
    expected: 'no developer rows', actual: list.body?.length, srs: ['REQ-4.1-14'],
  });
  info('GET /user-accounts', 'pending invitee reported through inviteAccepted', {
    expected: 'inviteAccepted=false until a password is set',
    actual: list.body?.find((a) => a.email === invitee)?.inviteAccepted,
    note: 'Depends on auth.users.encrypted_password being empty. Local GoTrue v2.197 stores a random hash for invited users, so this cannot be judged here; the 28 Oct report saw pending invites on the hosted project.',
  });

  // Full onboarding through the real emailed token.
  section('4.1 Authentication and accounts', ['REQ-4.1-07', 'REQ-4.1-17', 'REQ-4.1-19']);
  const { token, text } = await inviteToken(invitee);
  check('email', 'db', 'invitation email delivered with a link', Boolean(token), { expected: 'email with token', actual: Boolean(token) });
  check('email', 'shape', 'invitation contains no password', !/password\s*[:=]\s*\S+/i.test(text ?? ''), { expected: 'no credential', actual: 'checked', srs: ['REQ-4.1-17'] });
  const opened = await verifyInvite(token);
  const inviteSession = opened.body?.access_token;
  check('auth provider', 'happy', 'invite link opens a session', Boolean(inviteSession), { expected: 'session', actual: opened.status });
  await call('pending invite cannot use protected API', 'wrong-role', inviteSession, 'GET', '/auth/me', 403);
  await call('onboarding refused without a password', 'invalid', inviteSession, 'POST', '/auth/onboarding/complete', 400, { json: {} });
  await call('still blocked after that attempt', 'wrong-role', inviteSession, 'GET', '/auth/me', 403);
  const secret = password();
  await call('onboarding completes', 'happy', inviteSession, 'POST', '/auth/onboarding/complete', 200, { json: { password: secret } });
  const done = await auditRow('ONBOARDING_COMPLETED', { status: 'SUCCESS' });
  check('POST /auth/onboarding/complete', 'db', 'password setup audited', Boolean(done), { expected: 'ONBOARDING_COMPLETED', actual: done?.details ?? null, srs: ['REQ-4.1-11'] });
  const after = await signIn(invitee, secret);
  await call('onboarded curator can sign in', 'happy', after?.access_token, 'GET', '/auth/me', 200);
  const reuse = await verifyInvite(token);
  check('auth provider', 'invalid', 'used invitation link cannot be reused', reuse.status >= 400, { expected: '4xx', actual: reuse.status, srs: ['REQ-4.1-19'] });
  await call('onboarding without a token refused', 'no-jwt', 'none', 'POST', '/auth/onboarding/complete', 401, { json: { password: password() } });
  check('config', 'absence', 'approved invite/reset expiry is defined', false, {
    expected: 'documented approved period', actual: 'lifetime is a Supabase project setting; not in repo and hosted setting not read',
    srs: ['REQ-4.1-19'], note: 'Single use proven locally; expiry period unverified.',
  });

  // ---- Password recovery --------------------------------------------------
  section('4.1 Authentication and accounts', ['REQ-4.1-10', 'REQ-4.1-17']);
  await mailpit.clear();
  const known = await gotrue('POST', '/recover', { email: curator.email }, anonHeaders());
  const absent = await gotrue('POST', '/recover', { email: 'ghost@audit.example.invalid' }, anonHeaders());
  check('auth provider', 'happy', 'recovery gives same response for known and unknown email', known.status === absent.status && known.status === 200, {
    expected: 'identical 200', actual: [known.status, absent.status],
  });
  const reset = await inviteToken(curator.email);
  check('email', 'db', 'recovery email has a link and no password', Boolean(reset.token) && !reset.text.includes(curator.password), {
    expected: 'reset link only', actual: Boolean(reset.token),
  });
  const opens = await verifyInvite(reset.token, 'recovery');
  check('auth provider', 'happy', 'reset link opens a recovery session', Boolean(opens.body?.access_token), { expected: 'session', actual: opens.status });
  const twice = await verifyInvite(reset.token, 'recovery');
  check('auth provider', 'invalid', 'reset link cannot be reused', twice.status >= 400, { expected: '4xx', actual: twice.status, srs: ['REQ-4.1-19'] });
  section('4.1 Authentication and accounts', ['REQ-4.1-11']);
  await emails.clear();
  await call('change own password', 'happy', after?.access_token, 'POST', '/auth/password/change', 200, { json: { currentPassword: secret, newPassword: password() }, srs: ['REQ-4.1-16'] });
  const confirmation = await emails.waitFor((m) => JSON.stringify(m).includes('password was changed'));
  check('email', 'db', 'password-change confirmation email sent', confirmation.some((m) => JSON.stringify(m).includes('password was changed')), { expected: 'email', actual: confirmation.length, srs: ['REQ-4.1-18'] });
  await call('recovery request accepted', 'happy', 'none', 'POST', '/auth/password/recovery', 202, { json: { email: invitee } });
  const actions = (await sql('select distinct action from audit_log')).map((r) => r.action);
  check('audit', 'absence', 'recovery and password reset are audited', actions.some((a) => /RECOVER|RESET/i.test(a)), {
    expected: 'audit entry', actual: 'none: recovery runs in the provider and never reaches the backend',
  });
  check('audit', 'absence', 'password change is audited', actions.some((a) => /PASSWORD/i.test(a)), {
    expected: 'audit entry', actual: 'none: no backend password path',
  });

  // ---- Curator activation, deactivation, handover ------------------------
  section('4.1 Authentication and accounts', ['REQ-4.1-08']);
  const status = await api('curator', 'PATCH', `/user-accounts/${ids.curator2}/status`, { json: { status: 'INACTIVE', authorizationReason: 'audit' } });
  check('PATCH /user-accounts/:id/status', 'absence', 'curator can deactivate another curator', status.status === 200, {
    expected: 200, actual: status.status, note: 'Route does not exist.',
  });
  check('routes', 'absence', 'curator activation/deactivation route exists', hasRoute(/PATCH \/user-accounts/), { expected: 'route', actual: 'none' });
  section('4.1 Authentication and accounts', ['REQ-4.1-09']);
  check('routes', 'absence', 'handover operation exists', hasRoute(/handover|succession/i), { expected: 'route', actual: 'none' });
  check('POST /user-accounts/invitations', 'happy', 'successor can receive a separate account', invited.status === 201, {
    expected: 201, actual: invited.status, note: 'Only the separate-account half of succession is available.',
  });

  // ---- Developer account functions (4.2) ---------------------------------
  section('4.2 Developer functions', ['REQ-4.2-01', 'REQ-4.1-13']);
  await call('developer signs in', 'happy', 'developer', 'GET', '/auth/me', 200);

  section('4.2 Developer functions', ['REQ-4.2-02']);
  await mailpit.clear();
  const devEmail = 'dev-invitee@audit.example.invalid';
  const onboard = await call('developer onboards curator', 'happy', 'developer', 'POST', '/developer/curators/onboard', 201, { json: { email: devEmail, fullName: 'Audit Dev Invitee' } });
  const devRow = await one('select ua.id, ua.role, ua.status from user_account ua join auth.users u on u.id = ua.auth_user_id where u.email = $1', [devEmail]);
  check('POST /developer/curators/onboard', 'db', 'account stored as CURATOR', devRow?.role === 'CURATOR', { expected: 'CURATOR', actual: devRow ?? null });
  const onboardAudit = await auditRow('ONBOARD_CURATOR', { status: 'SUCCESS' });
  check('POST /developer/curators/onboard', 'db', 'onboarding audited', Boolean(onboardAudit), { expected: 'ONBOARD_CURATOR', actual: onboardAudit?.details ?? null, srs: ['REQ-4.2-09'] });
  await call('malformed email rejected', 'invalid', 'developer', 'POST', '/developer/curators/onboard', 400, { json: { email: 'nope', fullName: 'X' } });
  await call('email of a pending invitee rejected cleanly', 'invalid', 'developer', 'POST', '/developer/curators/onboard', [409, 422], { json: { email: devEmail, fullName: 'X' } });
  await call('email of an existing account rejected cleanly', 'invalid', 'developer', 'POST', '/developer/curators/onboard', [409, 422], { json: { email: accounts.curator.email, fullName: 'X' } });
  const devInvite = await inviteToken(devEmail);
  const devOpened = await verifyInvite(devInvite.token);
  await call('developer-invited curator blocked until a password is set', 'wrong-role', devOpened.body?.access_token, 'GET', '/auth/me', 403, { srs: ['REQ-4.2-02'] });

  const curators = await call('list curators', 'happy', 'developer', 'GET', '/developer/curators', 200, { srs: ['REQ-4.2-08'] });
  const listedPending = curators.body?.find((c) => c.id === onboard.body?.id);
  check('GET /developer/curators', 'shape', 'pending invitation is distinguishable from an active account', listedPending && listedPending.inviteAccepted === false, {
    expected: 'pending state', actual: listedPending ?? null, srs: ['REQ-4.2-02'],
    note: 'Carried from the 28 Oct report.',
  });

  section('4.2 Developer functions', ['REQ-4.2-03', 'REQ-4.1-12']);
  const path = `/developer/curators/${ids.curator2}/status`;
  await call('reason is mandatory', 'invalid', 'developer', 'PATCH', path, 400, { json: { status: 'INACTIVE' } });
  await call('blank reason rejected', 'invalid', 'developer', 'PATCH', path, 400, { json: { status: 'INACTIVE', authorizationReason: '' } });
  await call('invalid status rejected', 'invalid', 'developer', 'PATCH', path, 400, { json: { status: 'SUSPENDED', authorizationReason: 'x' } });
  await call('unknown curator is 404', 'invalid', 'developer', 'PATCH', `/developer/curators/${UNKNOWN_ID}/status`, 404, { json: { status: 'INACTIVE', authorizationReason: 'x' } });
  await call('developer account cannot be changed here', 'invalid', 'developer', 'PATCH', `/developer/curators/${ids.developer}/status`, [400, 403, 404], { json: { status: 'INACTIVE', authorizationReason: 'x' } });
  await call('deactivation with recorded reason', 'happy', 'developer', 'PATCH', path, 200, { json: { status: 'INACTIVE', authorizationReason: 'Audit memo 1' } });
  const stored = await one('select status from user_account where id = $1', [ids.curator2]);
  check('PATCH /developer/curators/:id/status', 'db', 'status persisted', stored?.status === 'INACTIVE', { expected: 'INACTIVE', actual: stored?.status });
  const statusAudit = await auditRow('UPDATE_CURATOR_STATUS', { status: 'SUCCESS' });
  check('PATCH /developer/curators/:id/status', 'db', 'audit stores the authorization', JSON.stringify(statusAudit?.details ?? {}).includes('Audit memo 1'), {
    expected: 'reason in audit', actual: statusAudit?.details ?? null, srs: ['REQ-4.2-03', 'REQ-4.2-09'],
  });
  await call('existing session of deactivated curator stops working', 'inactive-account', 'curator2', 'GET', '/auth/me', [401, 403]);
  await call('reactivation', 'happy', 'developer', 'PATCH', path, 200, { json: { status: 'ACTIVE', authorizationReason: 'Audit memo 2' } });
  await call('reactivated curator works', 'happy', 'curator2', 'GET', '/auth/me', 200);
  void tokens;
}
