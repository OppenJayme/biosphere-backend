import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import { AuthService } from './auth.service';

const supabaseMock = {
  auth: {
    signInWithPassword: jest.fn(),
    getUser: jest.fn(),
    admin: {
      inviteUserByEmail: jest.fn(),
    },
  },
};

const userAccountFindUnique = jest.fn();
const prismaMock = {
  user_account: {
    findUnique: userAccountFindUnique,
  },
};

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SUPABASE_CLIENT, useValue: supabaseMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('returns the active BioSphere account id and database role on login', async () => {
    supabaseMock.auth.signInWithPassword.mockResolvedValue({
      data: {
        session: { access_token: 'access-token' },
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
    supabaseMock.auth.signInWithPassword.mockResolvedValue({
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
});
