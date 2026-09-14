import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import type { AuthenticatedRequest, UserRole } from '../types/auth.types';

function contextWithUser(role: UserRole | undefined): ExecutionContext {
  const request: Partial<AuthenticatedRequest> = {
    user: role
      ? { id: 'u1', accountId: 'a1', email: 'u@example.com', role }
      : undefined,
  };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows the request when the route has no @Roles requirement', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(contextWithUser('CURATOR'))).toBe(true);
  });

  it('allows a DEVELOPER to reach a DEVELOPER-only route (e.g. curator onboarding)', () => {
    reflector.getAllAndOverride.mockReturnValue(['DEVELOPER']);

    expect(guard.canActivate(contextWithUser('DEVELOPER'))).toBe(true);
  });

  it('forbids a CURATOR from reaching a DEVELOPER-only route, so curators cannot onboard curators or create developer accounts', () => {
    reflector.getAllAndOverride.mockReturnValue(['DEVELOPER']);

    expect(() => guard.canActivate(contextWithUser('CURATOR'))).toThrow(
      ForbiddenException,
    );
  });

  it('forbids a request with no authenticated user from reaching a role-restricted route', () => {
    reflector.getAllAndOverride.mockReturnValue(['DEVELOPER']);

    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
