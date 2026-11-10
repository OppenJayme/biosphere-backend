import type { User } from '@supabase/supabase-js';
import type { Prisma } from '../generated/prisma/client';

/**
 * Set in Supabase app_metadata when a curator is invited and cleared once
 * they have set a password (REQ-4.1-07, REQ-4.1-11, REQ-4.2-02). Opening an
 * invite link already yields a valid session, so until then the account may
 * not use protected APIs. Only the service-role key can write app_metadata.
 */
export const ONBOARDING_PENDING_KEY = 'onboarding_pending';

/** How onboarding was confirmed, for the audit entry. */
export type OnboardingCompletionMethod = 'PASSWORD_SETUP' | 'PASSWORD_SIGN_IN';

export function isOnboardingPending(user: {
  app_metadata?: User['app_metadata'] | null;
}) {
  return user.app_metadata?.[ONBOARDING_PENDING_KEY] === true;
}

/**
 * The auth users who have accepted their invitation. Opening the link alone
 * does not count, because it already confirms the email and records a
 * sign-in. Both signals are needed: the flag covers an auth provider that
 * stores a random hash on invite, and the password check covers invites sent
 * before the Developer path set the flag. The database does the password
 * check, so no hash is ever read.
 */
export async function authUsersPastInvite(
  // A transaction client works too, so a check can run inside one.
  prisma: Pick<Prisma.TransactionClient, 'users'>,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const users = await prisma.users.findMany({
    where: {
      id: { in: ids },
      AND: [
        { encrypted_password: { not: null } },
        { encrypted_password: { not: '' } },
      ],
    },
    select: { id: true, raw_app_meta_data: true },
  });
  return new Set(
    users
      .filter(
        (user) =>
          !isOnboardingPending({
            app_metadata: user.raw_app_meta_data as User['app_metadata'] | null,
          }),
      )
      .map((user) => user.id),
  );
}
