import { ForbiddenException } from '@nestjs/common';

export type AccountAccessDeniedReason =
  'NO_ACCOUNT' | 'INACTIVE_ACCOUNT' | 'ONBOARDING_INCOMPLETE';

const MESSAGES: Record<AccountAccessDeniedReason, string> = {
  NO_ACCOUNT: 'This Supabase user has no BioSphere account.',
  INACTIVE_ACCOUNT: 'This BioSphere account is inactive.',
  ONBOARDING_INCOMPLETE:
    'Finish setting your password from the invitation email before using BioSphere.',
};

/**
 * A valid Supabase user that may not use BioSphere. Carries the reason and
 * the BioSphere account (when one exists) so the denial can be audited.
 */
export class AccountAccessDeniedException extends ForbiddenException {
  constructor(
    readonly reason: AccountAccessDeniedReason,
    readonly accountId: string | null,
  ) {
    super(MESSAGES[reason]);
  }
}
