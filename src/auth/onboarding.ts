import type { User } from '@supabase/supabase-js';

/**
 * Set in Supabase app_metadata when a curator is invited and cleared once
 * they have set a password (REQ-4.1-07, REQ-4.1-11). Opening an invite link
 * already yields a valid session, so until then the account may not use
 * protected APIs. Only the service-role key can write app_metadata.
 */
export const ONBOARDING_PENDING_KEY = 'onboarding_pending';

/** How onboarding was confirmed, for the audit entry. */
export type OnboardingCompletionMethod = 'PASSWORD_SETUP' | 'PASSWORD_SIGN_IN';

export function isOnboardingPending(user: Pick<User, 'app_metadata'>) {
  return user.app_metadata?.[ONBOARDING_PENDING_KEY] === true;
}
