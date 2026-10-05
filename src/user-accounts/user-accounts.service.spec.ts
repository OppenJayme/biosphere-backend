import { UserAccountsService } from './user-accounts.service';
import type { PrismaService } from '../prisma/prisma.service';

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    full_name: 'Maria Santos',
    role: 'CURATOR',
    status: 'ACTIVE',
    created_at: new Date('2026-09-01T00:00:00.000Z'),
    users: {
      email: 'maria@usc.edu.ph',
      email_confirmed_at: new Date('2026-09-01T01:00:00.000Z'),
      last_sign_in_at: new Date('2026-10-01T02:00:00.000Z'),
    },
    ...overrides,
  };
}

function build(rows: unknown[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma = { user_account: { findMany } } as unknown as PrismaService;
  return { service: new UserAccountsService(prisma), findMany };
}

describe('UserAccountsService', () => {
  it('lists every role, newest first', async () => {
    const { service, findMany } = build([]);
    await service.list();
    const args = findMany.mock.calls[0][0] as Record<string, unknown>;
    expect(args.where).toBeUndefined();
    expect(args.orderBy).toEqual({ created_at: 'desc' });
  });

  it('maps an account with its role, auth email, and last sign-in', async () => {
    const { service } = build([accountRow()]);
    await expect(service.list()).resolves.toEqual([
      {
        id: 'acc-1',
        fullName: 'Maria Santos',
        email: 'maria@usc.edu.ph',
        role: 'CURATOR',
        status: 'ACTIVE',
        inviteAccepted: true,
        lastSignInAt: new Date('2026-10-01T02:00:00.000Z'),
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
      },
    ]);
  });

  it('includes developer accounts', async () => {
    const { service } = build([accountRow({ id: 'dev-1', role: 'DEVELOPER' })]);
    const [account] = await service.list();
    expect(account.role).toBe('DEVELOPER');
  });

  it('marks an invite not yet accepted when the email is unconfirmed and never signed in', async () => {
    const { service } = build([
      accountRow({
        status: 'INACTIVE',
        users: {
          email: 'new@usc.edu.ph',
          email_confirmed_at: null,
          last_sign_in_at: null,
        },
      }),
    ]);
    const [account] = await service.list();
    expect(account.inviteAccepted).toBe(false);
    expect(account.lastSignInAt).toBeNull();
    expect(account.status).toBe('INACTIVE');
  });
});
