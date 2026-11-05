import type {
  account_status as AccountStatus,
  user_role as UserRole,
} from '../../generated/prisma/client';

// Mirrors the Prisma UserAccount model (database/sql/001_user_account.sql).
export class CuratorAccountEntity {
  id!: string;
  authUserId!: string;
  fullName!: string;
  role!: UserRole;
  status!: AccountStatus;
  // False until the invited curator has set a password. Status stays ACTIVE
  // while an invitation is pending, so this is what tells the two apart.
  inviteAccepted!: boolean;
  avatarPath?: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
