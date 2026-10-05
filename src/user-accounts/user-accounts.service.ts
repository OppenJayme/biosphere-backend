import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  UserAccountStatus,
  type UserAccountSummary,
} from './entities/user-account-summary.entity';

const USER_ACCOUNT_SELECT = {
  id: true,
  full_name: true,
  status: true,
  created_at: true,
  users: {
    select: { email: true, email_confirmed_at: true, last_sign_in_at: true },
  },
} satisfies Prisma.user_accountSelect;

type UserAccountRecord = Prisma.user_accountGetPayload<{
  select: typeof USER_ACCOUNT_SELECT;
}>;

@Injectable()
export class UserAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Curator accounts only, newest first: developer accounts stay out of curator views. */
  async list(): Promise<UserAccountSummary[]> {
    const rows = await this.prisma.user_account.findMany({
      where: { role: 'CURATOR' },
      orderBy: { created_at: 'desc' },
      select: USER_ACCOUNT_SELECT,
    });
    return rows.map((row) => this.toSummary(row));
  }

  private toSummary(row: UserAccountRecord): UserAccountSummary {
    const lastSignInAt = row.users.last_sign_in_at;
    return {
      id: row.id,
      fullName: row.full_name,
      email: row.users.email,
      status: UserAccountStatus[row.status],
      // An invited user confirms their email when they accept the invite.
      inviteAccepted: Boolean(row.users.email_confirmed_at ?? lastSignInAt),
      lastSignInAt,
      createdAt: row.created_at,
    };
  }
}
