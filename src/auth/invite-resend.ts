import {
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Prisma, user_account } from '../generated/prisma/client';
import { authUsersPastInvite } from './onboarding';

/** Audit action for both the curator and the Developer resend paths. */
export const RESEND_CURATOR_INVITE_ACTION = 'RESEND_CURATOR_INVITE';

// The provider refuses to re-invite an address that is already confirmed, and
// opening an invite link confirms it. A pending invitee may use password
// recovery, and their next sign-in finishes onboarding.
const LINK_ALREADY_OPENED =
  'This curator already opened their invitation link, so a new one cannot be sent. ' +
  'Ask them to use "Forgot password" on the sign-in page to set their password.';

export type ResentInvite = { account: user_account; email: string };

/**
 * Emails a new password-setup link to a curator whose invitation is still
 * pending, for example because the first link expired (REQ-4.1-07). The
 * account, its role and its pending-onboarding flag stay as they are: only
 * the email goes out again, and the old link stops working.
 *
 * Throws an HttpException that says why a resend was refused; the caller
 * audits it.
 */
export async function resendCuratorInvite(
  prisma: Pick<Prisma.TransactionClient, 'users' | 'user_account'>,
  supabase: SupabaseClient,
  accountId: string,
  redirectTo: string,
): Promise<ResentInvite> {
  const account = await prisma.user_account.findUnique({
    where: { id: accountId },
  });
  if (account?.role !== 'CURATOR') {
    throw new NotFoundException('Curator account not found.');
  }
  if (account.status !== 'ACTIVE') {
    throw new ConflictException(
      'This account is inactive. It must be activated before a new invitation can be sent.',
    );
  }
  const accepted = await authUsersPastInvite(prisma, [account.auth_user_id]);
  if (accepted.has(account.auth_user_id)) {
    throw new ConflictException(
      'This curator has already accepted their invitation and can sign in.',
    );
  }

  const authUser = await prisma.users.findUnique({
    where: { id: account.auth_user_id },
    select: { email: true, email_confirmed_at: true },
  });
  if (!authUser?.email) {
    throw new ConflictException(
      'This account has no email address on record, so no invitation can be sent.',
    );
  }
  if (authUser.email_confirmed_at) {
    throw new ConflictException(LINK_ALREADY_OPENED);
  }

  const { error } = await supabase.auth.admin.inviteUserByEmail(
    authUser.email,
    { redirectTo },
  );
  if (error) {
    if (error.code === 'email_exists' || error.status === 422) {
      throw new ConflictException(LINK_ALREADY_OPENED);
    }
    if (error.status === 429) {
      throw new HttpException(
        'Too many emails were sent recently. Wait a few minutes and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    throw new ServiceUnavailableException(
      'The invitation email could not be sent. Try again later.',
    );
  }

  return { account, email: authUser.email };
}
