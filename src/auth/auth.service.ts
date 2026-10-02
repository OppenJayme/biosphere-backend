import {
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { createSupabaseAuthClient } from '../supabase/supabase-auth-client.factory';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import { AccountAccessDeniedException } from './account-access-denied.exception';
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
      user = await this.resolveActiveAccount(data.user);
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
    const { data, error } = await this.supabase.auth.getUser(token);

    // Missing, malformed, or expired tokens are not audited: they cannot be
    // attributed to an account and would flood the log.
    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    try {
      return await this.resolveActiveAccount(data.user);
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

    return {
      id: authUser.id,
      accountId: account.id,
      email: authUser.email ?? null,
      role: account.role,
    };
  }
}
