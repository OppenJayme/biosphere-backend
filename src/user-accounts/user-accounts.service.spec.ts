import { UserAccountsService } from './user-accounts.service';
import type { PrismaService } from '../prisma/prisma.service';

function accountRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'acc-1',
    full_name: 'Maria Santos',
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
    const { service } = build([accountRow()]);
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
