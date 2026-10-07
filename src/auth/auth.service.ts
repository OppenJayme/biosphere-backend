import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { createSupabaseAuthClient } from '../supabase/supabase-auth-client.factory';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import { AccountAccessDeniedException } from './account-access-denied.exception';
import {
  isOnboardingPending,
  ONBOARDING_PENDING_KEY,
  type OnboardingCompletionMethod,
} from './onboarding';
import { SecurityAuditService } from './security-audit.service';
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
   * Called with the invite session after the new curator sets a password
   * (REQ-4.1-07, REQ-4.1-11). The database confirms a password now exists
   * without reading it; then the pending flag is cleared and the completion
   * audited. Calling it again after completion changes nothing.
   */
  async completeOnboarding(
    token: string,
    attempt?: AccessAttemptContext,
  ): Promise<{ onboardingComplete: true }> {
    const authUser = await this.authUserFor(token);
    const user = await this.resolveForRequest(authUser, attempt, {
      allowPendingOnboarding: true,
    });

    if (!isOnboardingPending(authUser)) return { onboardingComplete: true };

    const withPassword = await this.prisma.users.count({
      where: {
        id: authUser.id,
        AND: [
          { encrypted_password: { not: null } },
          { encrypted_password: { not: '' } },
        ],
      },
    });
    if (withPassword === 0) {
      await this.securityAudit.record({
        action: 'ONBOARDING_COMPLETED',
        result: 'FAILED',
        accountId: user.accountId,
        details: { reason: 'PASSWORD_NOT_SET' },
      });
      throw new ConflictException(
        'Set your password before finishing onboarding.',
      );
    }

    await this.finishOnboarding(authUser.id, user.accountId, 'PASSWORD_SETUP');
    return { onboardingComplete: true };
  }

  private async finishOnboarding(
    authUserId: string,
    accountId: string,
    method: OnboardingCompletionMethod,
  ): Promise<void> {
    // app_metadata keys are merged, so the role is kept.
    const { error } = await this.supabase.auth.admin.updateUserById(
      authUserId,
      { app_metadata: { [ONBOARDING_PENDING_KEY]: false } },
    );
    if (error) {
      await this.securityAudit.record({
        action: 'ONBOARDING_COMPLETED',
        result: 'FAILED',
        accountId,
        details: { method, reason: 'PROVIDER_UPDATE_FAILED' },
      });
      throw new ServiceUnavailableException(
        'Your account could not be activated right now. Try again shortly.',
      );
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
