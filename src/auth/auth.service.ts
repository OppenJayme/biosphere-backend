import {
  ForbiddenException,
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
import type { AuthenticatedUser } from './types/auth.types';

@Injectable()
export class AuthService {
  constructor(
    // Service-role client — Admin/Storage operations only. Never call
    // signInWithPassword() on it; see createSupabaseAuthClient().
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const authClient = createSupabaseAuthClient(this.configService);
    const { data, error } = await authClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const user = await this.resolveActiveAccount(data.user);

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
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
