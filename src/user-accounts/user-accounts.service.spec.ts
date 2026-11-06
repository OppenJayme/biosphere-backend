import {
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { SupabaseClient } from '@supabase/supabase-js';
import { UserAccountStatus } from './entities/user-account-summary.entity';
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
  const prisma = {
    user_account: { findMany, create },
    users: { findFirst, findMany: usersFindMany },
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
  };
}

const actor: AuthenticatedUser = {
  id: 'auth-actor',
  accountId: 'acc-actor',
  email: 'curator@usc.edu.ph',
  role: 'CURATOR',
};

const dto = { email: 'new@usc.edu.ph', fullName: 'Juan dela Cruz' };

describe('UserAccountsService.updateCuratorStatus', () => {
  const targetId = 'acc-target';
  const deactivate = {
    status: UserAccountStatus.INACTIVE,
    reason: 'Left the museum',
  };

  type FixtureRow = Record<string, unknown> | null;

  function statusFixture({
    acting = { status: 'ACTIVE' },
    target = { ...accountRow({ id: targetId }), role: 'CURATOR' },
    transactionError,
  }: {
    acting?: FixtureRow;
    target?: FixtureRow;
    transactionError?: Error;
  } = {}) {
    const auditCreate = jest.fn().mockResolvedValue({});
    const txAuditCreate = jest.fn().mockResolvedValue({});
    const update = jest
      .fn()
      .mockResolvedValue(accountRow({ id: targetId, status: 'INACTIVE' }));
    const findUnique = jest
      .fn()
      .mockResolvedValueOnce(acting)
      .mockResolvedValueOnce(target);
    const transaction = {
      user_account: { findUnique, update },
      audit_log: { create: txAuditCreate },
    };
    const runTransaction = jest.fn((operation: (tx: unknown) => unknown) =>
      transactionError
        ? Promise.reject(transactionError)
        : operation(transaction),
    );
    const prisma = {
      $transaction: runTransaction,
      users: { findMany: jest.fn().mockResolvedValue([]) },
      audit_log: { create: auditCreate },
    } as unknown as PrismaService;
    return {
      service: new UserAccountsService(
        prisma,
        {} as SupabaseClient,
        {} as ConfigService,
      ),
      runTransaction,
      auditCreate,
      txAuditCreate,
      update,
    };
  }

  it('deactivates another curator and audits it in the same transaction', async () => {
    const { service, update, txAuditCreate, auditCreate } = statusFixture();

    const result = await service.updateCuratorStatus(
      targetId,
      deactivate,
      actor,
    );

    expect(result.status).toBe('INACTIVE');
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: targetId },
        data: { status: 'INACTIVE' },
      }),
    );
    expect(txAuditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: actor.accountId,
        affected_record_id: targetId,
        action: 'UPDATE_CURATOR_STATUS',
        module: 'user-accounts',
        status: 'SUCCESS',
        details: {
          previousStatus: 'ACTIVE',
          newStatus: 'INACTIVE',
          reason: 'Left the museum',
        },
      }) as unknown,
    });
    expect(auditCreate).not.toHaveBeenCalled();
  });

  it('refuses a change to your own account and audits the denial', async () => {
    const { service, runTransaction, auditCreate } = statusFixture();

    await expect(
      service.updateCuratorStatus(actor.accountId, deactivate, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(runTransaction).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'UPDATE_CURATOR_STATUS',
        status: 'DENIED',
      }) as unknown,
    });
  });

  it('refuses an actor deactivated by a concurrent request', async () => {
    const { service, update } = statusFixture({
      acting: { status: 'INACTIVE' },
    });

    await expect(
      service.updateCuratorStatus(targetId, deactivate, actor),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown id', null],
    ['a developer account', { ...accountRow(), role: 'DEVELOPER' }],
  ])('reports %s as not found', async (_label, target) => {
    const { service, update, auditCreate } = statusFixture({ target });

    await expect(
      service.updateCuratorStatus(targetId, deactivate, actor),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(update).not.toHaveBeenCalled();
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'FAILED' }) as unknown,
    });
  });

  it('changes nothing when the account already has the status', async () => {
    const { service, update, txAuditCreate } = statusFixture({
      target: {
        ...accountRow({ id: targetId, status: 'INACTIVE' }),
        role: 'CURATOR',
      },
    });

    const result = await service.updateCuratorStatus(
      targetId,
      deactivate,
      actor,
    );

    expect(result.status).toBe('INACTIVE');
    expect(update).not.toHaveBeenCalled();
    expect(txAuditCreate).not.toHaveBeenCalled();
  });

  it('hides unexpected failures and audits them', async () => {
    const { service, auditCreate } = statusFixture({
      transactionError: new Error('database unavailable'),
    });

    await expect(
      service.updateCuratorStatus(targetId, deactivate, actor),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'FAILED' }) as unknown,
    });
  });
});

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
