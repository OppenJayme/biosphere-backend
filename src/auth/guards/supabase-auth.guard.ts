import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../../supabase/supabase.constants';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { type AuthenticatedRequest, parseUserRole } from '../types/auth.types';

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
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

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization token');
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Malformed authorization token');
    }

    const { data, error } = await this.supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const roleValue: unknown = data.user.app_metadata.role;

    req.user = {
      id: data.user.id,
      email: data.user.email ?? null,
      role: parseUserRole(roleValue),
    };

    return true;
  }
}
