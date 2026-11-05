import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthSessionMissingError } from '@supabase/supabase-js';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { createSupabaseAuthClient } from '../supabase/supabase-auth-client.factory';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import { AuthService } from './auth.service';
import { SecurityAuditService } from './security-audit.service';

jest.mock('../supabase/supabase-auth-client.factory');

// The service-role client — must only ever be used for getUser(token) in
// these tests. signInWithPassword must never be called on it.
const supabaseMock = {
  auth: {
    signInWithPassword: jest.fn(),
    getUser: jest.fn(),
    admin: { updateUserById: jest.fn(), signOut: jest.fn() },
  },
};

// The fresh, per-login client returned by createSupabaseAuthClient().
const authClientMock = {
  auth: {
    signInWithPassword: jest.fn(),
    resetPasswordForEmail: jest.fn(),
  },
};

const userAccountFindUnique = jest.fn();
const usersFindFirst = jest.fn();
const prismaMock = {
  user_account: {
    findUnique: userAccountFindUnique,
  },
  users: { findFirst: usersFindFirst },
};

const configServiceMock = {
  getOrThrow: jest.fn(),
};

const securityAuditMock = { record: jest.fn() };
const mailMock = { send: jest.fn() };

// Shaped like a provider access token; only the payload is ever read.
function tokenWithAmr(method: string) {
  const payload = Buffer.from(
    JSON.stringify({ amr: [{ method, timestamp: 1 }] }),
  ).toString('base64url');
  return `header.${payload}.signature`;
}

const authUser = {
  id: 'auth-user-1',
  email: 'curator@example.com',
  app_metadata: { role: 'DEVELOPER' },
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest
      .mocked(createSupabaseAuthClient)
      .mockReturnValue(authClientMock as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SUPABASE_CLIENT, useValue: supabaseMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: SecurityAuditService, useValue: securityAuditMock },
        { provide: MailService, useValue: mailMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('signs in through a fresh isolated client, never the shared service-role client', async () => {
    authClientMock.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
        user: authUser,
      },
      error: null,
    });
    userAccountFindUnique.mockResolvedValue({
      id: 'account-1',
      role: 'CURATOR',
      status: 'ACTIVE',
    });

    await service.login('curator@example.com', 'password');

    expect(createSupabaseAuthClient).toHaveBeenCalledWith(configServiceMock);
    expect(authClientMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'curator@example.com',
      password: 'password',
    });
    expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it('returns the active BioSphere account id and database role on login', async () => {
    authClientMock.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
        },
        user: authUser,
      },
      error: null,
    });
    userAccountFindUnique.mockResolvedValue({
      id: 'account-1',
      role: 'CURATOR',
      status: 'ACTIVE',
    });

    await expect(
      service.login('curator@example.com', 'password'),
    ).resolves.toEqual({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      user: {
        id: 'auth-user-1',
        accountId: 'account-1',
        email: 'curator@example.com',
        role: 'CURATOR',
      },
    });
    expect(userAccountFindUnique).toHaveBeenCalledWith({
      where: { auth_user_id: 'auth-user-1' },
      select: { id: true, role: true, status: true },
    });
  });

  it('rejects invalid Supabase credentials', async () => {
    authClientMock.auth.signInWithPassword.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid credentials' },
    });

    await expect(
      service.login('curator@example.com', 'wrong-password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(userAccountFindUnique).not.toHaveBeenCalled();
  });

  it('rejects a valid Supabase user without a BioSphere account', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: authUser },
      error: null,
    });
    userAccountFindUnique.mockResolvedValue(null);

    await expect(
      service.authenticateAccessToken('access-token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an inactive BioSphere account', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: authUser },
      error: null,
    });
    userAccountFindUnique.mockResolvedValue({
      id: 'account-1',
      role: 'CURATOR',
      status: 'INACTIVE',
    });

    await expect(
      service.authenticateAccessToken('access-token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an invalid or expired access token before querying Prisma', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    await expect(
      service.authenticateAccessToken('expired-token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(userAccountFindUnique).not.toHaveBeenCalled();
  });
  describe('security audit (REQ-4.1-15)', () => {
    function signInSucceeds() {
      authClientMock.auth.signInWithPassword.mockResolvedValue({
        data: {
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
          },
          user: authUser,
        },
        error: null,
      });
    }

    function auditedValues(): string {
      return JSON.stringify(securityAuditMock.record.mock.calls);
    }

    it('records a successful login against the account', async () => {
      signInSucceeds();
      userAccountFindUnique.mockResolvedValue({
        id: 'account-1',
        role: 'CURATOR',
        status: 'ACTIVE',
      });

      await service.login(' Curator@Example.com ', 'secret-password');

      expect(securityAuditMock.record).toHaveBeenCalledTimes(1);
      expect(securityAuditMock.record).toHaveBeenCalledWith({
        action: 'LOGIN',
        result: 'SUCCESS',
        accountId: 'account-1',
        details: { email: 'curator@example.com', role: 'CURATOR' },
      });
      expect(auditedValues()).not.toContain('secret-password');
      expect(auditedValues()).not.toContain('access-token');
      expect(auditedValues()).not.toContain('refresh-token');
    });

    it('records a failed login without the password', async () => {
      authClientMock.auth.signInWithPassword.mockResolvedValue({
        data: { session: null, user: null },
        error: {
          message: 'Invalid login credentials',
          code: 'invalid_credentials',
        },
      });

      await expect(
        service.login('curator@example.com', 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(securityAuditMock.record).toHaveBeenCalledWith({
        action: 'LOGIN',
        result: 'FAILED',
        details: {
          email: 'curator@example.com',
          reason: 'INVALID_CREDENTIALS',
          providerCode: 'invalid_credentials',
        },
      });
      expect(auditedValues()).not.toContain('wrong-password');
    });

    it('records a login denied for an inactive account', async () => {
      signInSucceeds();
      userAccountFindUnique.mockResolvedValue({
        id: 'account-1',
        role: 'CURATOR',
        status: 'INACTIVE',
      });

      await expect(
        service.login('curator@example.com', 'password'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(securityAuditMock.record).toHaveBeenCalledWith({
        action: 'LOGIN',
        result: 'DENIED',
        accountId: 'account-1',
        details: { email: 'curator@example.com', reason: 'INACTIVE_ACCOUNT' },
      });
    });

    it('records a login denied for a user with no BioSphere account', async () => {
      signInSucceeds();
      userAccountFindUnique.mockResolvedValue(null);

      await expect(
        service.login('curator@example.com', 'password'),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(securityAuditMock.record).toHaveBeenCalledWith({
        action: 'LOGIN',
        result: 'DENIED',
        accountId: null,
        details: { email: 'curator@example.com', reason: 'NO_ACCOUNT' },
      });
    });

    it('records an inactive account using a still-valid token', async () => {
      supabaseMock.auth.getUser.mockResolvedValue({
        data: { user: authUser },
        error: null,
      });
      userAccountFindUnique.mockResolvedValue({
        id: 'account-1',
        role: 'CURATOR',
        status: 'INACTIVE',
      });

      await expect(
        service.authenticateAccessToken('access-token', {
          method: 'GET',
          path: '/specimens/search',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(securityAuditMock.record).toHaveBeenCalledWith({
        action: 'ACCESS_DENIED',
        result: 'DENIED',
        accountId: 'account-1',
        details: {
          reason: 'INACTIVE_ACCOUNT',
          method: 'GET',
          path: '/specimens/search',
        },
      });
    });

    it('does not record expired or invalid tokens, or active-account requests', async () => {
      supabaseMock.auth.getUser.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid token' },
      });
      await expect(
        service.authenticateAccessToken('expired-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      supabaseMock.auth.getUser.mockResolvedValueOnce({
        data: { user: authUser },
        error: null,
      });
      userAccountFindUnique.mockResolvedValue({
        id: 'account-1',
        role: 'CURATOR',
        status: 'ACTIVE',
      });
      await service.authenticateAccessToken('access-token');

      expect(securityAuditMock.record).not.toHaveBeenCalled();
    });
  });

  describe('curator onboarding (REQ-4.1-07, REQ-4.1-11)', () => {
    const pendingUser = {
      ...authUser,
      app_metadata: { role: 'CURATOR', onboarding_pending: true },
    };
    const onboardedUser = {
      ...authUser,
      app_metadata: { role: 'CURATOR', onboarding_pending: false },
    };
    const activeCurator = {
      id: 'account-1',
      role: 'CURATOR',
      status: 'ACTIVE',
    };

    function sessionFor(user: object) {
      supabaseMock.auth.getUser.mockResolvedValue({
        data: { user },
        error: null,
      });
    }

    function auditedValues(): string {
      return JSON.stringify(securityAuditMock.record.mock.calls);
    }

    beforeEach(() => {
      userAccountFindUnique.mockResolvedValue(activeCurator);
      supabaseMock.auth.admin.updateUserById.mockResolvedValue({
        data: {},
        error: null,
      });
    });

    it('denies protected access to an invite session whose password is not set', async () => {
      sessionFor(pendingUser);

      await expect(
        service.authenticateAccessToken('invite-session-token', {
          method: 'GET',
          path: '/specimens',
        }),
      ).rejects.toMatchObject({ reason: 'ONBOARDING_INCOMPLETE' });

      expect(securityAuditMock.record).toHaveBeenCalledWith({
        action: 'ACCESS_DENIED',
        result: 'DENIED',
        accountId: 'account-1',
        details: {
          reason: 'ONBOARDING_INCOMPLETE',
          method: 'GET',
          path: '/specimens',
        },
      });
    });

    it('sets the password and clears the flag in one provider update, audited without secrets', async () => {
      sessionFor(pendingUser);

      await expect(
        service.completeOnboarding('invite-session-token', 'chosen-password'),
      ).resolves.toEqual({ onboardingComplete: true });

      expect(supabaseMock.auth.admin.updateUserById).toHaveBeenCalledTimes(1);
      expect(supabaseMock.auth.admin.updateUserById).toHaveBeenCalledWith(
        'auth-user-1',
        {
          app_metadata: { onboarding_pending: false },
          password: 'chosen-password',
        },
      );
      expect(securityAuditMock.record).toHaveBeenCalledWith({
        action: 'ONBOARDING_COMPLETED',
        result: 'SUCCESS',
        accountId: 'account-1',
        details: { method: 'PASSWORD_SETUP' },
      });
      expect(auditedValues()).not.toContain('invite-session-token');
      expect(auditedValues()).not.toContain('chosen-password');
    });

    it('reports a password the provider refuses and keeps the invite pending', async () => {
      sessionFor(pendingUser);
      supabaseMock.auth.admin.updateUserById.mockResolvedValue({
        data: {},
        error: { message: 'weak', code: 'weak_password', status: 422 },
      });

      await expect(
        service.completeOnboarding('invite-session-token', 'password'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('allows protected access after onboarding is complete', async () => {
      sessionFor(onboardedUser);

      await expect(
        service.authenticateAccessToken('session-token'),
      ).resolves.toMatchObject({ accountId: 'account-1', role: 'CURATOR' });
      expect(securityAuditMock.record).not.toHaveBeenCalled();
    });

    it('changes nothing when onboarding was already completed', async () => {
      sessionFor(onboardedUser);

      await expect(
        service.completeOnboarding('session-token', 'another-password'),
      ).resolves.toEqual({ onboardingComplete: true });
      expect(supabaseMock.auth.admin.updateUserById).not.toHaveBeenCalled();
      expect(securityAuditMock.record).not.toHaveBeenCalled();
    });

    it('does not let a deactivated invite finish onboarding', async () => {
      sessionFor(pendingUser);
      userAccountFindUnique.mockResolvedValue({
        ...activeCurator,
        status: 'INACTIVE',
      });

      await expect(
        service.completeOnboarding('invite-session-token', 'chosen-password'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(supabaseMock.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it('rejects an invalid session without touching the account', async () => {
      supabaseMock.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      await expect(
        service.completeOnboarding('bad-token', 'chosen-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(userAccountFindUnique).not.toHaveBeenCalled();
    });

    it('reports a provider failure instead of claiming completion', async () => {
      sessionFor(pendingUser);
      supabaseMock.auth.admin.updateUserById.mockResolvedValue({
        data: {},
        error: { message: 'down' },
      });

      await expect(
        service.completeOnboarding('invite-session-token', 'chosen-password'),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(securityAuditMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ONBOARDING_COMPLETED',
          result: 'FAILED',
        }),
      );
    });

    it('completes onboarding on the first password sign-in, since that proves a password exists', async () => {
      authClientMock.auth.signInWithPassword.mockResolvedValue({
        data: {
          session: {
            access_token: 'access-token',
            refresh_token: 'refresh-token',
          },
          user: pendingUser,
        },
        error: null,
      });

      await expect(
        service.login('curator@example.com', 'secret-password'),
      ).resolves.toMatchObject({ user: { accountId: 'account-1' } });

      expect(supabaseMock.auth.admin.updateUserById).toHaveBeenCalledWith(
        'auth-user-1',
        { app_metadata: { onboarding_pending: false } },
      );
      expect(securityAuditMock.record).toHaveBeenCalledWith({
        action: 'ONBOARDING_COMPLETED',
        result: 'SUCCESS',
        accountId: 'account-1',
        details: { method: 'PASSWORD_SIGN_IN' },
      });
      expect(auditedValues()).not.toContain('secret-password');
      expect(auditedValues()).not.toContain('access-token');
    });
  });

  describe('passwords', () => {
    const user = {
      id: 'auth-user-1',
      accountId: 'account-1',
      email: 'curator@example.com',
      role: 'CURATOR' as const,
    };
    const passwords = {
      currentPassword: 'current-secret',
      newPassword: 'replacement-secret',
    };
    const auditedSecrets = () =>
      JSON.stringify(securityAuditMock.record.mock.calls);

    beforeEach(() => {
      supabaseMock.auth.admin.updateUserById.mockResolvedValue({
        data: {},
        error: null,
      });
      supabaseMock.auth.admin.signOut.mockResolvedValue({
        data: null,
        error: null,
      });
      authClientMock.auth.signInWithPassword.mockResolvedValue({
        data: { session: { access_token: 'check' }, user: authUser },
        error: null,
      });
      mailMock.send.mockResolvedValue({ delivered: true, result: 'SENT 1' });
    });

    describe('changePassword', () => {
      it('confirms the current password, ends sessions, emails and audits', async () => {
        await expect(
          service.changePassword(user, 'session-token', passwords),
        ).resolves.toEqual({ passwordChanged: true });

        expect(authClientMock.auth.signInWithPassword).toHaveBeenCalledWith({
          email: 'curator@example.com',
          password: 'current-secret',
        });
        expect(supabaseMock.auth.signInWithPassword).not.toHaveBeenCalled();
        expect(supabaseMock.auth.admin.updateUserById).toHaveBeenCalledWith(
          'auth-user-1',
          { password: 'replacement-secret' },
        );
        expect(supabaseMock.auth.admin.signOut).toHaveBeenCalledWith(
          'session-token',
          'global',
        );
        expect(mailMock.send).toHaveBeenCalledWith(
          expect.objectContaining({ to: 'curator@example.com' }),
        );
        expect(JSON.stringify(mailMock.send.mock.calls)).not.toMatch(
          /replacement-secret|current-secret|session-token/,
        );
        expect(securityAuditMock.record).toHaveBeenCalledWith({
          action: 'PASSWORD_CHANGED',
          result: 'SUCCESS',
          accountId: 'account-1',
          details: { sessionsEnded: true, confirmationEmailSent: true },
        });
        expect(auditedSecrets()).not.toMatch(/secret|session-token/);
      });

      it('refuses a wrong current password and changes nothing', async () => {
        authClientMock.auth.signInWithPassword.mockResolvedValue({
          data: { session: null, user: null },
          error: { message: 'Invalid login credentials' },
        });

        await expect(
          service.changePassword(user, 'session-token', passwords),
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(supabaseMock.auth.admin.updateUserById).not.toHaveBeenCalled();
        expect(mailMock.send).not.toHaveBeenCalled();
        expect(securityAuditMock.record).toHaveBeenCalledWith({
          action: 'PASSWORD_CHANGED',
          result: 'FAILED',
          accountId: 'account-1',
          details: { reason: 'INVALID_CURRENT_PASSWORD' },
        });
      });

      it('refuses a new password equal to the current one', async () => {
        await expect(
          service.changePassword(user, 'session-token', {
            currentPassword: 'same-secret',
            newPassword: 'same-secret',
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(authClientMock.auth.signInWithPassword).not.toHaveBeenCalled();
      });

      it('audits a provider failure and sends no confirmation', async () => {
        supabaseMock.auth.admin.updateUserById.mockResolvedValue({
          data: {},
          error: { message: 'down', code: 'unexpected_failure', status: 500 },
        });

        await expect(
          service.changePassword(user, 'session-token', passwords),
        ).rejects.toBeInstanceOf(ServiceUnavailableException);

        expect(mailMock.send).not.toHaveBeenCalled();
        expect(securityAuditMock.record).toHaveBeenCalledWith({
          action: 'PASSWORD_CHANGED',
          result: 'FAILED',
          accountId: 'account-1',
          details: {
            reason: 'PROVIDER_UPDATE_FAILED',
            providerCode: 'unexpected_failure',
          },
        });
      });

      it('treats a token the provider already revoked as ended', async () => {
        supabaseMock.auth.admin.signOut.mockResolvedValue({
          data: null,
          error: new AuthSessionMissingError(),
        });

        await service.changePassword(user, 'session-token', passwords);

        expect(securityAuditMock.record).toHaveBeenCalledWith(
          expect.objectContaining({
            details: { sessionsEnded: true, confirmationEmailSent: true },
          }),
        );
      });

      it('keeps the change and records it when the email or sign-out fails', async () => {
        supabaseMock.auth.admin.signOut.mockResolvedValue({
          data: null,
          error: { message: 'down', status: 500 },
        });
        mailMock.send.mockResolvedValue({
          delivered: false,
          result: 'FAILED 500',
        });

        await expect(
          service.changePassword(user, 'session-token', passwords),
        ).resolves.toEqual({ passwordChanged: true });

        expect(securityAuditMock.record).toHaveBeenCalledWith(
          expect.objectContaining({
            result: 'SUCCESS',
            details: { sessionsEnded: false, confirmationEmailSent: false },
          }),
        );
      });
    });

    describe('requestPasswordRecovery', () => {
      beforeEach(() => {
        authClientMock.auth.resetPasswordForEmail.mockResolvedValue({
          data: {},
          error: null,
        });
      });

      it('answers the same for known and unknown emails and audits both', async () => {
        usersFindFirst.mockResolvedValueOnce({
          user_account: { id: 'account-1' },
        });
        usersFindFirst.mockResolvedValueOnce(null);

        const known = await service.requestPasswordRecovery('a@example.com');
        const unknown = await service.requestPasswordRecovery('b@example.com');

        expect(known).toEqual(unknown);
        expect(securityAuditMock.record).toHaveBeenNthCalledWith(1, {
          action: 'PASSWORD_RECOVERY_REQUESTED',
          result: 'SUCCESS',
          accountId: 'account-1',
          details: { email: 'a@example.com' },
        });
        expect(securityAuditMock.record).toHaveBeenNthCalledWith(2, {
          action: 'PASSWORD_RECOVERY_REQUESTED',
          result: 'SUCCESS',
          accountId: null,
          details: { email: 'b@example.com' },
        });
      });

      it('hides a provider failure from the caller but audits it', async () => {
        usersFindFirst.mockResolvedValue(null);
        authClientMock.auth.resetPasswordForEmail.mockResolvedValue({
          data: null,
          error: { message: 'limit', code: 'over_email_send_rate_limit' },
        });

        await expect(
          service.requestPasswordRecovery('a@example.com'),
        ).resolves.toEqual({ accepted: true });

        expect(securityAuditMock.record).toHaveBeenCalledWith(
          expect.objectContaining({
            result: 'FAILED',
            details: {
              email: 'a@example.com',
              providerCode: 'over_email_send_rate_limit',
            },
          }),
        );
      });
    });

    describe('resetPassword', () => {
      beforeEach(() => {
        supabaseMock.auth.getUser.mockResolvedValue({
          data: { user: { ...authUser, app_metadata: { role: 'CURATOR' } } },
          error: null,
        });
        userAccountFindUnique.mockResolvedValue({
          id: 'account-1',
          role: 'CURATOR',
          status: 'ACTIVE',
        });
      });

      it.each(['otp', 'recovery'])(
        'resets with a session opened by %s, ends sessions and audits',
        async (method) => {
          const token = tokenWithAmr(method);

          await expect(
            service.resetPassword(token, 'replacement-secret'),
          ).resolves.toEqual({ passwordReset: true });

          expect(supabaseMock.auth.admin.updateUserById).toHaveBeenCalledWith(
            'auth-user-1',
            { password: 'replacement-secret' },
          );
          expect(supabaseMock.auth.admin.signOut).toHaveBeenCalledWith(
            token,
            'global',
          );
          expect(securityAuditMock.record).toHaveBeenCalledWith({
            action: 'PASSWORD_RESET',
            result: 'SUCCESS',
            accountId: 'account-1',
            details: { sessionsEnded: true, confirmationEmailSent: true },
          });
          expect(auditedSecrets()).not.toContain('replacement-secret');
        },
      );

      it.each([
        ['a password session', tokenWithAmr('password')],
        ['a token with no readable claims', 'not-a-jwt'],
      ])('refuses %s', async (_name, token) => {
        await expect(
          service.resetPassword(token, 'replacement-secret'),
        ).rejects.toBeInstanceOf(ForbiddenException);

        expect(supabaseMock.auth.admin.updateUserById).not.toHaveBeenCalled();
        expect(securityAuditMock.record).toHaveBeenCalledWith({
          action: 'PASSWORD_RESET',
          result: 'DENIED',
          accountId: 'account-1',
          details: { reason: 'NOT_A_RECOVERY_SESSION' },
        });
      });

      it('refuses an inactive account', async () => {
        userAccountFindUnique.mockResolvedValue({
          id: 'account-1',
          role: 'CURATOR',
          status: 'INACTIVE',
        });

        await expect(
          service.resetPassword(tokenWithAmr('otp'), 'replacement-secret'),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(supabaseMock.auth.admin.updateUserById).not.toHaveBeenCalled();
      });
    });
  });
});
