import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/types/auth.types';

/**
 * Pulls the authenticated user (set by SupabaseAuthGuard) off the request.
 * Only meaningful behind a route that isn't @Public() — on a public route
 * this will be undefined.
 *
 * NOTE: if `common/decorators/current-user.decorator.ts` already exists in
 * your repo (it's referenced in docs/backend-architecture.md §3), skip this
 * file and just import the existing one instead.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);