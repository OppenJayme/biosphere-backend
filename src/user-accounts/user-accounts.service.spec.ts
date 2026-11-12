import {
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UserAccountsService } from './user-accounts.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    auth_user_id: 'auth-1',
    full_name: 'Maria Santos',
    status: 'ACTIVE',
    created_at: new Date('2026-09-01T00:00:00.000Z'),
    users: {
      email: 'maria@usc.edu.ph',
      last_sign_in_at: new Date('2026-10-01T02:00:00.000Z'),
    },
    ...overrides,
  };
}

function build(rows: unknown[] = [], authIdsWithPassword: string[] = []) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const usersFindMany = jest
    .fn()
    .mockResolvedValue(authIdsWithPassword.map((id) => ({ id })));
  const create = jest.fn();
  const findFirst = jest.fn().mockResolvedValue(null);
  const auditCreate = jest.fn().mockResolvedValue({});
  const accountFindUnique = jest.fn().mockResolvedValue({
    id: 'acc-new',
    auth_user_id: 'auth-new',
    full_name: 'Juan dela Cruz',
    role: 'CURATOR',
    status: 'ACTIVE',
  });
  const findUniqueOrThrow = jest.fn().mockResolvedValue(invitedRow());
  const usersFindUnique = jest
    .fn()
    .mockResolvedValue({ email: 'new@usc.edu.ph', email_confirmed_at: null });
  const prisma = {
    user_account: {
      findMany,
      create,
      findUnique: accountFindUnique,
      findUniqueOrThrow,
    },
    users: {
      findFirst,
      findMany: usersFindMany,
      findUnique: usersFindUnique,
    },
    audit_log: { create: auditCreate },
  } as unknown as PrismaService;
  const admin = {
    inviteUserByEmail: jest
      .fn()
      .mockResolvedValue({ data: { user: { id: 'auth-new' } }, error: null }),
    updateUserById: jest.fn().mockResolvedValue({ data: {}, error: null }),
    deleteUser: jest.fn().mockResolvedValue({ data: {}, error: null }),
  };
  const supabase = { auth: { admin } } as unknown as SupabaseClient;
  const config = {
    getOrThrow: jest.fn().mockReturnValue('https://biosphere.test/'),
  } as unknown as ConfigService;
  return {
    service: new UserAccountsService(prisma, supabase, config),
    findMany,
    create,
    findFirst,
    usersFindMany,
    auditCreate,
    admin,
    accountFindUnique,
    findUniqueOrThrow,
    usersFindUnique,
  };
}

const actor: AuthenticatedUser = {
  id: 'auth-actor',
  accountId: 'acc-actor',
  email: 'curator@usc.edu.ph',
  role: 'CURATOR',
};

const dto = { email: 'new@usc.edu.ph', fullName: 'Juan dela Cruz' };

function invitedRow() {
  return accountRow({
    id: 'acc-new',
    auth_user_id: 'auth-new',
    full_name: 'Juan dela Cruz',
    users: {
      email: 'new@usc.edu.ph',
      last_sign_in_at: null,
    },
  });
}

function lastAudit(auditCreate: jest.Mock): Record<string, unknown> {
  const calls = auditCreate.mock.calls as [{ data: Record<string, unknown> }][];
  return calls[calls.length - 1][0].data;
}

describe('UserAccountsService', () => {
  it('lists only curator accounts, newest first', async () => {
    const { service, findMany } = build([]);
    await service.list();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: 'CURATOR' },
        orderBy: { created_at: 'desc' },
      }),
    );
  });

  it('maps an account with its auth email and last sign-in', async () => {
    const { service } = build([accountRow()], ['auth-1']);
    await expect(service.list()).resolves.toEqual([
      {
        id: 'acc-1',
        fullName: 'Maria Santos',
        email: 'maria@usc.edu.ph',
        status: 'ACTIVE',
        inviteAccepted: true,
        lastSignInAt: new Date('2026-10-01T02:00:00.000Z'),
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]);
  });

  it('keeps an invite pending when the link was opened but no password was set', async () => {
    const { service } = build([accountRow()], []);
    const [account] = await service.list();
    expect(account.inviteAccepted).toBe(false);
    expect(account.lastSignInAt).toEqual(new Date('2026-10-01T02:00:00.000Z'));
  });

  it('asks the database which accounts have a password without reading the hash', async () => {
    const { service, usersFindMany } = build([accountRow()], ['auth-1']);
    await service.list();
    expect(usersFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['auth-1'] },
        AND: [
          { encrypted_password: { not: null } },
          { encrypted_password: { not: '' } },
        ],
      },
      select: { id: true, raw_app_meta_data: true },
    });
  });

  it('keeps an invite pending while the flag is set, even with a stored hash', async () => {
    const { service, usersFindMany } = build([accountRow()]);
    usersFindMany.mockResolvedValue([
      { id: 'auth-1', raw_app_meta_data: { onboarding_pending: true } },
    ]);

    const [account] = await service.list();

    expect(account.inviteAccepted).toBe(false);
  });

  it('skips the password lookup when there are no curators', async () => {
    const { service, usersFindMany } = build([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(usersFindMany).not.toHaveBeenCalled();
  });
});

describe('UserAccountsService.inviteCurator', () => {
  it('invites a separate curator account that shows as a pending invite', async () => {
    const { service, admin, create, auditCreate } = build();
    create.mockResolvedValue(invitedRow());

    const result = await service.inviteCurator(dto, actor);

    expect(admin.inviteUserByEmail).toHaveBeenCalledWith('new@usc.edu.ph', {
      data: { role: 'CURATOR' },
      redirectTo: 'https://biosphere.test/login/accept-invite',
    });
    expect(admin.updateUserById).toHaveBeenCalledWith('auth-new', {
      app_metadata: { role: 'CURATOR', onboarding_pending: true },
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          auth_user_id: 'auth-new',
          full_name: 'Juan dela Cruz',
          role: 'CURATOR',
          status: 'ACTIVE',
        },
      }),
    );
    expect(result).toMatchObject({
      id: 'acc-new',
      email: 'new@usc.edu.ph',
      status: 'ACTIVE',
      inviteAccepted: false,
    });
    expect(lastAudit(auditCreate)).toEqual({
      user_id: 'acc-actor',
      affected_record_id: 'acc-new',
      affected_record_type: 'user_account',
      action: 'INVITE_CURATOR',
      module: 'user-accounts',
      status: 'SUCCESS',
      details: { email: 'new@usc.edu.ph', fullName: 'Juan dela Cruz' },
    });
  });

  it('never sends or stores a password or invitation secret', async () => {
    const { service, admin, create, auditCreate } = build();
    create.mockResolvedValue(invitedRow());

    await service.inviteCurator(dto, actor);

    const sent = JSON.stringify([
      admin.inviteUserByEmail.mock.calls,
      admin.updateUserById.mock.calls,
      auditCreate.mock.calls,
    ]).toLowerCase();
    expect(sent).not.toMatch(/password|token|secret|otp/);
  });

  it('rejects an email that already belongs to an account without emailing anyone', async () => {
    const { service, admin, findFirst, create, auditCreate } = build();
    findFirst.mockResolvedValue({ id: 'auth-existing' });

    await expect(service.inviteCurator(dto, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(findFirst).toHaveBeenCalledWith({
      where: { email: { equals: 'new@usc.edu.ph', mode: 'insensitive' } },
      select: { id: true },
    });
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(lastAudit(auditCreate)).toMatchObject({
      action: 'INVITE_CURATOR',
      status: 'FAILED',
    });
  });

  it('maps an email Supabase already knows to a conflict', async () => {
    const { service, admin, create } = build();
    admin.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: {
        message: 'already registered',
        status: 422,
        code: 'email_exists',
      },
    });

    await expect(service.inviteCurator(dto, actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('reports an email delivery failure as unavailable and audits it', async () => {
    const { service, admin, create, auditCreate } = build();
    admin.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'SMTP down', status: 500 },
    });

    await expect(service.inviteCurator(dto, actor)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(create).not.toHaveBeenCalled();
    expect(lastAudit(auditCreate)).toMatchObject({
      status: 'FAILED',
      details: { email: 'new@usc.edu.ph', reason: 'SMTP down' },
    });
  });

  it('removes the auth user when the curator role cannot be assigned', async () => {
    const { service, admin, create } = build();
    admin.updateUserById.mockResolvedValue({
      data: {},
      error: { message: 'boom' },
    });

    await expect(service.inviteCurator(dto, actor)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(admin.deleteUser).toHaveBeenCalledWith('auth-new');
    expect(create).not.toHaveBeenCalled();
  });

  it('removes the auth user when the account record cannot be created', async () => {
    const { service, admin, create, auditCreate } = build();
    create.mockRejectedValue(new Error('insert failed'));

    await expect(service.inviteCurator(dto, actor)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(admin.deleteUser).toHaveBeenCalledWith('auth-new');
    expect(lastAudit(auditCreate)).toMatchObject({ status: 'FAILED' });
  });

  it('still returns the new account when the audit write fails', async () => {
    const { service, create, auditCreate } = build();
    create.mockResolvedValue(invitedRow());
    auditCreate.mockRejectedValue(new Error('audit down'));

    await expect(service.inviteCurator(dto, actor)).resolves.toMatchObject({
      id: 'acc-new',
    });
  });
});

describe('UserAccountsService.resendInvite', () => {
  it('emails a new link to a pending curator and audits it', async () => {
    const { service, admin, auditCreate, findUniqueOrThrow } = build();

    await expect(service.resendInvite('acc-new', actor)).resolves.toEqual({
      id: 'acc-new',
      fullName: 'Juan dela Cruz',
      email: 'new@usc.edu.ph',
      status: 'ACTIVE',
      inviteAccepted: false,
      lastSignInAt: null,
      createdAt: new Date('2026-09-01T00:00:00.000Z'),
    });
    expect(admin.inviteUserByEmail).toHaveBeenCalledWith('new@usc.edu.ph', {
      redirectTo: 'https://biosphere.test/login/accept-invite',
    });
    expect(findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'acc-new' } }),
    );
    expect(admin.updateUserById).not.toHaveBeenCalled();
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(lastAudit(auditCreate)).toEqual({
      user_id: 'acc-actor',
      affected_record_id: 'acc-new',
      affected_record_type: 'user_account',
      action: 'RESEND_CURATOR_INVITE',
      module: 'user-accounts',
      status: 'SUCCESS',
      details: { email: 'new@usc.edu.ph' },
    });
  });

  it('audits a refused resend and passes the reason on', async () => {
    const { service, admin, auditCreate, usersFindMany } = build();
    usersFindMany.mockResolvedValue([{ id: 'auth-new' }]);

    await expect(service.resendInvite('acc-new', actor)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(lastAudit(auditCreate)).toMatchObject({
      action: 'RESEND_CURATOR_INVITE',
      affected_record_id: 'acc-new',
      status: 'FAILED',
      details: { reason: expect.stringMatching(/already accepted/) },
    });
  });

  it('never resends to a developer account', async () => {
    const { service, admin, accountFindUnique } = build();
    accountFindUnique.mockResolvedValue({
      id: 'acc-dev',
      auth_user_id: 'auth-dev',
      role: 'DEVELOPER',
      status: 'ACTIVE',
    });

    await expect(service.resendInvite('acc-dev', actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('reports a delivery failure as unavailable', async () => {
    const { service, admin, auditCreate } = build();
    admin.inviteUserByEmail.mockResolvedValue({
      data: { user: null },
      error: { message: 'smtp down', status: 500 },
    });

    await expect(service.resendInvite('acc-new', actor)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(lastAudit(auditCreate)).toMatchObject({ status: 'FAILED' });
  });
});
