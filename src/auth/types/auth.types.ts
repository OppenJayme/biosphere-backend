import type { Request } from 'express';

export type UserRole = 'CURATOR' | 'DEVELOPER';

export interface AuthenticatedUser {
  id: string;
  email: string | null;
  role: UserRole | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export function parseUserRole(value: unknown): UserRole | null {
  if (value === 'CURATOR' || value === 'DEVELOPER') {
    return value;
  }

  return null;
}
