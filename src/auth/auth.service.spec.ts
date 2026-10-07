import {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
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
    admin: { updateUserById: jest.fn() },
  },
};

// The fresh, per-login client returned by createSupabaseAuthClient().
const authClientMock = {
  auth: {
    signInWithPassword: jest.fn(),
  },
};

const userAccountFindUnique = jest.fn();
const usersCount = jest.fn();
const prismaMock = {
  user_account: {
    findUnique: userAccountFindUnique,
  },
  users: { count: usersCount },
};

const configServiceMock = {
  getOrThrow: jest.fn(),
};

const securityAuditMock = { record: jest.fn() };

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

    it('refuses to complete onboarding before a password exists', async () => {
      sessionFor(pendingUser);
      usersCount.mockResolvedValue(0);

      await expect(
        service.completeOnboarding('invite-session-token'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(usersCount).toHaveBeenCalledWith({
        where: {
          id: 'auth-user-1',
          AND: [
            { encrypted_password: { not: null } },
            { encrypted_password: { not: '' } },
          ],
        },
      });
      expect(supabaseMock.auth.admin.updateUserById).not.toHaveBeenCalled();
      expect(securityAuditMock.record).toHaveBeenCalledWith({
        action: 'ONBOARDING_COMPLETED',
        result: 'FAILED',
        accountId: 'account-1',
        details: { reason: 'PASSWORD_NOT_SET' },
      });
    });

    it('completes onboarding once the password is set and audits it without secrets', async () => {
      sessionFor(pendingUser);
      usersCount.mockResolvedValue(1);

      await expect(
        service.completeOnboarding('invite-session-token'),
      ).resolves.toEqual({ onboardingComplete: true });

      expect(supabaseMock.auth.admin.updateUserById).toHaveBeenCalledWith(
        'auth-user-1',
        { app_metadata: { onboarding_pending: false } },
      );
      expect(securityAuditMock.record).toHaveBeenCalledWith({
        action: 'ONBOARDING_COMPLETED',
        result: 'SUCCESS',
        accountId: 'account-1',
        details: { method: 'PASSWORD_SETUP' },
      });
      expect(auditedValues()).not.toContain('invite-session-token');
      expect(auditedValues()).not.toMatch(/password"|token"|secret/i);
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
        service.completeOnboarding('session-token'),
      ).resolves.toEqual({ onboardingComplete: true });
      expect(usersCount).not.toHaveBeenCalled();
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
        service.completeOnboarding('invite-session-token'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(supabaseMock.auth.admin.updateUserById).not.toHaveBeenCalled();
    });

    it('rejects an invalid session without touching the account', async () => {
      supabaseMock.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      await expect(
        service.completeOnboarding('bad-token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(userAccountFindUnique).not.toHaveBeenCalled();
    });

    it('reports a provider failure instead of claiming completion', async () => {
      sessionFor(pendingUser);
      usersCount.mockResolvedValue(1);
      supabaseMock.auth.admin.updateUserById.mockResolvedValue({
        data: {},
        error: { message: 'down' },
      });

      await expect(
        service.completeOnboarding('invite-session-token'),
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
});
