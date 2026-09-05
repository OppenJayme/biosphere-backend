import type { user_role, account_status } from '../../generated/prisma/client';

// Mirrors the Prisma UserAccount model (database/sql/001_user_account.sql).
export class CuratorAccountEntity {
  id!: string;
  authUserId!: string;
  fullName!: string;
  role!: user_role;
  status!: account_status;
  avatarPath?: string | null;
  createdAt!: Date;
  updatedAt?: Date;
}