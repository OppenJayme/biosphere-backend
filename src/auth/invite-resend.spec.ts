import {
  ConflictException,
  HttpException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resendCuratorInvite } from './invite-resend';

const REDIRECT = 'https://biosphere.test/login/accept-invite';

function pendingAccount(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    auth_user_id: 'auth-1',
    full_name: 'Juan dela Cruz',
    role: 'CURATOR',
    status: 'ACTIVE',
    ...overrides,
  };
}

type BuildOptions = {
  account?: Record<string, unknown> | null;
  // Rows authUsersPastInvite sees: a stored password and no pending flag.
  pastInvite?: { id: string; raw_app_meta_data?: unknown }[];
  authUser?: Record<string, unknown> | null;
  inviteResult?: unknown;
};

function build({
  account = pendingAccount(),
  pastInvite = [],
  authUser = { email: 'juan@usc.edu.ph', email_confirmed_at: null },
  inviteResult = { data: { user: { id: 'auth-1' } }, error: null },
}: BuildOptions = {}) {
  const prisma = {
    user_account: { findUnique: jest.fn().mockResolvedValue(account) },
    users: {
      findMany: jest.fn().mockResolvedValue(pastInvite),
      findUnique: jest.fn().mockResolvedValue(authUser),
    },
  };
  const inviteUserByEmail = jest.fn().mockResolvedValue(inviteResult);
  const supabase = {
    auth: { admin: { inviteUserByEmail } },
  } as unknown as SupabaseClient;
  const run = () =>
    resendCuratorInvite(
      prisma as unknown as Parameters<typeof resendCuratorInvite>[0],
      supabase,
      'acc-1',
      REDIRECT,
    );
  return { prisma, inviteUserByEmail, run };
}

describe('resendCuratorInvite', () => {
  it('emails a new link to the stored address of a pending curator', async () => {
    const { run, inviteUserByEmail } = build();

    await expect(run()).resolves.toEqual({
      account: expect.objectContaining({ id: 'acc-1' }),
      email: 'juan@usc.edu.ph',
    });
    expect(inviteUserByEmail).toHaveBeenCalledWith('juan@usc.edu.ph', {
      redirectTo: REDIRECT,
    });
  });

  it('never changes the account role, status or pending flag', async () => {
    const { run, inviteUserByEmail } = build();
    await run();
    const [, options] = inviteUserByEmail.mock.calls[0] as [string, object];
    expect(options).not.toHaveProperty('data');
  });

  it.each([
    ['no account', null],
    ['a developer account', pendingAccount({ role: 'DEVELOPER' })],
  ])('treats %s as not found', async (_label, account) => {
    const { run, inviteUserByEmail } = build({ account });
    await expect(run()).rejects.toBeInstanceOf(NotFoundException);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('refuses an inactive account', async () => {
    const { run, inviteUserByEmail } = build({
      account: pendingAccount({ status: 'INACTIVE' }),
    });
    await expect(run()).rejects.toThrow(/inactive/);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('refuses a curator who already accepted', async () => {
    const { run, inviteUserByEmail } = build({
      pastInvite: [{ id: 'auth-1' }],
    });
    await expect(run()).rejects.toThrow(/already accepted/);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('still resends while the pending flag is set, even with a stored hash', async () => {
    const { run, inviteUserByEmail } = build({
      pastInvite: [
        { id: 'auth-1', raw_app_meta_data: { onboarding_pending: true } },
      ],
    });
    await run();
    expect(inviteUserByEmail).toHaveBeenCalled();
  });

  it('refuses when no email is on record', async () => {
    const { run, inviteUserByEmail } = build({ authUser: null });
    await expect(run()).rejects.toBeInstanceOf(ConflictException);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('points to password recovery once the link was opened', async () => {
    const { run, inviteUserByEmail } = build({
      authUser: {
        email: 'juan@usc.edu.ph',
        email_confirmed_at: new Date('2026-11-10T00:00:00.000Z'),
      },
    });
    await expect(run()).rejects.toThrow(/Forgot password/);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('maps a provider refusal for a confirmed address to the same conflict', async () => {
    const { run } = build({
      inviteResult: {
        data: { user: null },
        error: { message: 'exists', status: 422, code: 'email_exists' },
      },
    });
    await expect(run()).rejects.toThrow(/Forgot password/);
  });

  it('reports the email rate limit as 429', async () => {
    const { run } = build({
      inviteResult: {
        data: { user: null },
        error: { message: 'rate limit', status: 429 },
      },
    });
    const error: unknown = await run().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
  });

  it('reports any other delivery failure as unavailable', async () => {
    const { run } = build({
      inviteResult: {
        data: { user: null },
        error: { message: 'smtp down', status: 500 },
      },
    });
    await expect(run()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
