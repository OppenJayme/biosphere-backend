import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  isAuthSessionMissingError,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { createSupabaseAuthClient } from '../supabase/supabase-auth-client.factory';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import { AccountAccessDeniedException } from './account-access-denied.exception';
import {
  isOnboardingPending,
  ONBOARDING_PENDING_KEY,
  type OnboardingCompletionMethod,
} from './onboarding';
import {
  SecurityAuditService,
  type SecurityAuditAction,
} from './security-audit.service';
import type { AuthenticatedUser } from './types/auth.types';

/** Where a protected request was denied, for the audit entry. */
export interface AccessAttemptContext {
  method: string;
  path: string;
}

const MAX_AUDITED_EMAIL_LENGTH = 254;

function auditedEmail(email: unknown): string | null {
  return typeof email === 'string'
    ? email.trim().toLowerCase().slice(0, MAX_AUDITED_EMAIL_LENGTH)
    : null;
}

/**
 * Whether an access token came from an emailed code rather than a password.
 * The provider reports a recovery code as `otp`, and `recovery` is accepted in
 * case a provider version names it directly. Only read after the provider has
 * validated the token, so the claims can be trusted.
 */
function isEmailCodeSession(token: string): boolean {
  try {
    const claims = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
    ) as { amr?: Array<{ method?: string }> };
    return (
      claims.amr?.some(
        (entry) => entry.method === 'otp' || entry.method === 'recovery',
      ) ?? false
    );
  } catch {
    return false;
  }
}

/** A password the provider refused, or a provider that could not be reached. */
function passwordUpdateError(error: { code?: string; status?: number }) {
  return error.code === 'weak_password' || error.status === 422
    ? new BadRequestException(
        'That password is too weak. Choose a stronger one.',
      )
    : new ServiceUnavailableException(
        'Your password could not be saved right now. Try again shortly.',
      );
}

const PASSWORD_CHANGED_TEXT =
  'The password for your BioSphere account was just changed. If you made ' +
  'this change, you do not need to do anything. If you did not, reset your ' +
  'password from the sign-in page and tell the museum curator straight away.';

@Injectable()
export class AuthService {
  constructor(
    // Service-role client — Admin/Storage operations only. Never call
    // signInWithPassword() on it; see createSupabaseAuthClient().
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly securityAudit: SecurityAuditService,
    private readonly mail: MailService,
  ) {}

  async login(email: string, password: string) {
    const authClient = createSupabaseAuthClient(this.configService);
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      // The password and provider tokens are never recorded (REQ-4.1-15).
      await this.securityAudit.record({
        action: 'LOGIN',
        result: 'FAILED',
        details: {
          email: auditedEmail(email),
          reason: 'INVALID_CREDENTIALS',
          providerCode: error?.code ?? null,
        },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    let user: AuthenticatedUser;
    try {
      // A pending invite may sign in: a successful password sign-in proves
      // the password was set, which completes onboarding below.
      user = await this.resolveActiveAccount(data.user, {
        allowPendingOnboarding: true,
      });
    } catch (denied) {
      if (denied instanceof AccountAccessDeniedException) {
        await this.securityAudit.record({
          action: 'LOGIN',
          result: 'DENIED',
          accountId: denied.accountId,
          details: { email: auditedEmail(email), reason: denied.reason },
        });
      }
      throw denied;
    }

    if (isOnboardingPending(data.user)) {
      await this.finishOnboarding(
        data.user.id,
        user.accountId,
        'PASSWORD_SIGN_IN',
      );
    }

    await this.securityAudit.record({
      action: 'LOGIN',
      result: 'SUCCESS',
      accountId: user.accountId,
      details: { email: auditedEmail(email), role: user.role },
    });

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user,
    };
  }

  async authenticateAccessToken(
    token: string,
    attempt?: AccessAttemptContext,
  ): Promise<AuthenticatedUser> {
    const authUser = await this.authUserFor(token);
    return this.resolveForRequest(authUser, attempt);
  }

  /**
   * Sets the invited curator's first password with the invite session and
   * clears the pending flag in the same provider update (REQ-4.1-07,
   * REQ-4.1-11). The backend sets the password itself because the provider
   * may store a random hash on invite, so nothing it stores can prove the
   * invitee chose one. Calling it after completion changes nothing, which
   * also keeps this route from replacing a password without the current one.
   */
  async completeOnboarding(
    token: string,
    password: string,
    attempt?: AccessAttemptContext,
  ): Promise<{ onboardingComplete: true }> {
    const authUser = await this.authUserFor(token);
    const user = await this.resolveForRequest(authUser, attempt, {
      allowPendingOnboarding: true,
    });

    if (!isOnboardingPending(authUser)) return { onboardingComplete: true };

    await this.finishOnboarding(
      authUser.id,
      user.accountId,
      'PASSWORD_SETUP',
      password,
    );
    return { onboardingComplete: true };
  }

  /**
   * Changes the signed-in user's own password after confirming the current
   * one (REQ-4.1-16). Every session ends, including this one, so a stolen
   * session does not outlive the change and the next step is a normal sign-in.
   */
  async changePassword(
    user: AuthenticatedUser,
    token: string,
    passwords: { currentPassword: string; newPassword: string },
  ): Promise<{ passwordChanged: true }> {
    const refuse = async (reason: string, message: string) => {
      await this.securityAudit.record({
        action: 'PASSWORD_CHANGED',
        result: 'FAILED',
        accountId: user.accountId,
        details: { reason },
      });
      return new BadRequestException(message);
    };

    if (!user.email) {
      throw await refuse(
        'NO_EMAIL',
        'This account has no email address to confirm the change.',
      );
    }
    if (passwords.newPassword === passwords.currentPassword) {
      throw await refuse(
        'SAME_PASSWORD',
        'Choose a new password that differs from your current one.',
      );
    }

    // A fresh client, so this sign-in cannot touch the shared service client.
    const { data, error } = await createSupabaseAuthClient(
      this.configService,
    ).auth.signInWithPassword({
      email: user.email,
      password: passwords.currentPassword,
    });
    if (error || !data.session) {
      throw await refuse(
        'INVALID_CURRENT_PASSWORD',
        'Your current password is incorrect.',
      );
    }

    await this.replacePassword({
      action: 'PASSWORD_CHANGED',
      authUserId: user.id,
      accountId: user.accountId,
      email: user.email,
      newPassword: passwords.newPassword,
      token,
    });
    return { passwordChanged: true };
  }

  /**
   * Emails a reset code through the provider and audits the request
   * (REQ-4.1-10, REQ-4.1-11). The outcome is never returned, so the route
   * cannot be used to find out which emails have accounts.
   */
  async requestPasswordRecovery(email: string): Promise<{ accepted: true }> {
    const authUser = await this.prisma.users.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
      select: { user_account: { select: { id: true } } },
    });
    const { error } = await createSupabaseAuthClient(
      this.configService,
    ).auth.resetPasswordForEmail(email);

    await this.securityAudit.record({
      action: 'PASSWORD_RECOVERY_REQUESTED',
      result: error ? 'FAILED' : 'SUCCESS',
      accountId: authUser?.user_account?.id ?? null,
      details: {
        email: auditedEmail(email),
        ...(error ? { providerCode: error.code ?? null } : {}),
      },
    });
    return { accepted: true };
  }

  /**
   * Sets a new password with the session a recovery code opened
   * (REQ-4.1-10). A session opened with a password is refused, because it
   * could otherwise skip the current-password check in changePassword. Every
   * session ends afterwards, so the next step is a normal sign-in.
   */
  async resetPassword(
    token: string,
    newPassword: string,
    attempt?: AccessAttemptContext,
  ): Promise<{ passwordReset: true }> {
    const authUser = await this.authUserFor(token);
    // A pending invitee may recover too; their next sign-in finishes onboarding.
    const user = await this.resolveForRequest(authUser, attempt, {
      allowPendingOnboarding: true,
    });

    if (!isEmailCodeSession(token)) {
      await this.securityAudit.record({
        action: 'PASSWORD_RESET',
        result: 'DENIED',
        accountId: user.accountId,
        details: { reason: 'NOT_A_RECOVERY_SESSION' },
      });
      throw new ForbiddenException(
        'Request a new reset code to set your password.',
      );
    }

    await this.replacePassword({
      action: 'PASSWORD_RESET',
      authUserId: authUser.id,
      accountId: user.accountId,
      email: authUser.email ?? null,
      newPassword,
      token,
    });
    return { passwordReset: true };
  }

  /** The last step of a password change or reset; no secret is ever recorded. */
  private async replacePassword(change: {
    action: Extract<SecurityAuditAction, 'PASSWORD_CHANGED' | 'PASSWORD_RESET'>;
    authUserId: string;
    accountId: string;
    email: string | null;
    newPassword: string;
    token: string;
  }): Promise<void> {
    const { error } = await this.supabase.auth.admin.updateUserById(
      change.authUserId,
      { password: change.newPassword },
    );
    if (error) {
      await this.securityAudit.record({
        action: change.action,
        result: 'FAILED',
        accountId: change.accountId,
        details: {
          reason: 'PROVIDER_UPDATE_FAILED',
          providerCode: error.code ?? null,
        },
      });
      throw passwordUpdateError(error);
    }

    // The password has changed by now, so neither of these may fail the
    // request. Both outcomes go in the audit entry instead. The provider
    // normally revokes the user's sessions on an admin password update, in
    // which case it refuses this sign-out; that still counts as revoked.
    const { error: sessionError } = await this.supabase.auth.admin.signOut(
      change.token,
      'global',
    );
    const sessionsEnded =
      !sessionError || isAuthSessionMissingError(sessionError);
    const email = change.email
      ? await this.mail.send({
          to: change.email,
          subject: 'Your BioSphere password was changed',
          text: PASSWORD_CHANGED_TEXT,
          html: `<p>${PASSWORD_CHANGED_TEXT}</p>`,
        })
      : null;

    await this.securityAudit.record({
      action: change.action,
      result: 'SUCCESS',
      accountId: change.accountId,
      details: {
        sessionsEnded,
        confirmationEmailSent: email?.delivered ?? false,
      },
    });
  }

  private async finishOnboarding(
    authUserId: string,
    accountId: string,
    method: OnboardingCompletionMethod,
    password?: string,
  ): Promise<void> {
    // app_metadata keys are merged, so the role is kept.
    const { error } = await this.supabase.auth.admin.updateUserById(
      authUserId,
      {
        app_metadata: { [ONBOARDING_PENDING_KEY]: false },
        ...(password ? { password } : {}),
      },
    );
    if (error) {
      await this.securityAudit.record({
        action: 'ONBOARDING_COMPLETED',
        result: 'FAILED',
        accountId,
        details: { method, reason: 'PROVIDER_UPDATE_FAILED' },
      });
      throw passwordUpdateError(error);
    }

    // Never the password, the invite link, or session tokens (REQ-4.1-11).
    await this.securityAudit.record({
      action: 'ONBOARDING_COMPLETED',
      result: 'SUCCESS',
      accountId,
      details: { method },
    });
  }

  private async authUserFor(token: string): Promise<User> {
    const { data, error } = await this.supabase.auth.getUser(token);

    // Missing, malformed, or expired tokens are not audited: they cannot be
    // attributed to an account and would flood the log.
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired session');
    }
    return data.user;
  }

  private async resolveForRequest(
    authUser: User,
    attempt?: AccessAttemptContext,
    options?: { allowPendingOnboarding?: boolean },
  ): Promise<AuthenticatedUser> {
    try {
      return await this.resolveActiveAccount(authUser, options);
    } catch (denied) {
      if (denied instanceof AccountAccessDeniedException) {
        await this.securityAudit.record({
          action: 'ACCESS_DENIED',
          result: 'DENIED',
          accountId: denied.accountId,
          details: {
            reason: denied.reason,
            method: attempt?.method ?? null,
            path: attempt?.path ?? null,
          },
        });
      }
      throw denied;
    }
  }

  async getFullName(accountId: string): Promise<string> {
    const account = await this.prisma.user_account.findUnique({
      where: { id: accountId },
      select: { full_name: true },
    });

    if (!account) {
      throw new NotFoundException('BioSphere account not found.');
    }

    return account.full_name;
  }

  private async resolveActiveAccount(
    authUser: User,
    { allowPendingOnboarding = false } = {},
  ): Promise<AuthenticatedUser> {
    const account = await this.prisma.user_account.findUnique({
      where: { auth_user_id: authUser.id },
      select: {
        id: true,
        role: true,
        status: true,
      },
    });

    if (!account) {
      throw new AccountAccessDeniedException('NO_ACCOUNT', null);
    }

    if (account.status !== 'ACTIVE') {
      throw new AccountAccessDeniedException('INACTIVE_ACCOUNT', account.id);
    }

    if (!allowPendingOnboarding && isOnboardingPending(authUser)) {
      throw new AccountAccessDeniedException(
        'ONBOARDING_INCOMPLETE',
        account.id,
      );
    }

    return {
      id: authUser.id,
      accountId: account.id,
      email: authUser.email ?? null,
      role: account.role,
    };
  }
}
