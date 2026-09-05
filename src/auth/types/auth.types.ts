import type { Request } from 'express';

export type UserRole = 'CURATOR' | 'DEVELOPER';

export interface AuthenticatedUser {
  /** Supabase auth.users.id. Kept as `id` for existing API compatibility. */
  id: string;
  /** public.user_account.id. Use this value for BioSphere foreign keys. */
  accountId: string;
  email: string | null;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
