import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import type { AuthenticatedRequest } from '../types/auth.types';
import { bearerToken } from './bearer-token';
import { requestPath } from './request-path';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const token = bearerToken(req.headers.authorization);

    req.user = await this.authService.authenticateAccessToken(token, {
      method: req.method,
      path: requestPath(req),
    });

    return true;
  }
}
