import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { PrismaService } from '../prisma/prisma.service';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import type { AuthenticatedUser, UserRole } from './types/auth.types';

@Injectable()
export class AuthService {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly prisma: PrismaService,
  ) {}

  async login(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.resolveActiveAccount(data.user);

    return {
      access_token: data.session.access_token,
      user,
    };
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedUser> {
    const { data, error } = await this.supabase.auth.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return this.resolveActiveAccount(data.user);
  }

  async inviteUser(email: string, role: UserRole) {
    const { data, error } = await this.supabase.auth.admin.inviteUserByEmail(
      email,
      {
        data: { role },
      },
    );

    if (error) {
      throw error;
    }

    return data;
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
      throw new ForbiddenException(
        'This Supabase user has no BioSphere account.',
      );
    }

    if (account.status !== 'ACTIVE') {
      throw new ForbiddenException('This BioSphere account is inactive.');
    }

    return {
      id: authUser.id,
      accountId: account.id,
      email: authUser.email ?? null,
      role: account.role,
    };
  }
}
