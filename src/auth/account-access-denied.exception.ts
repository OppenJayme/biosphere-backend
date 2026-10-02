import { ForbiddenException } from '@nestjs/common';

export type AccountAccessDeniedReason = 'NO_ACCOUNT' | 'INACTIVE_ACCOUNT';

/**
 * A valid Supabase user that may not use BioSphere. Carries the reason and
 * the BioSphere account (when one exists) so the denial can be audited.
 */
export class AccountAccessDeniedException extends ForbiddenException {
  constructor(
    readonly reason: AccountAccessDeniedReason,
    readonly accountId: string | null,
  ) {
    super(
      reason === 'NO_ACCOUNT'
        ? 'This Supabase user has no BioSphere account.'
        : 'This BioSphere account is inactive.',
    );
  }
}
