import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import { parseUserRole, type UserRole } from './types/auth.types';

@Injectable()
export class AuthService {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async login(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const roleValue: unknown = data.user.app_metadata.role;

    return {
      access_token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email ?? null,
        role: parseUserRole(roleValue),
      },
    };
  }

  async inviteUser(email: string, role: UserRole) {
    const { data, error } = await this.supabase.auth.admin.inviteUserByEmail(email);

    if (error || !data?.user) {
      throw error ?? new Error('Invite failed: No User Returned');
    }

    const { data: updated, error: updateError } = await this.supabase.auth.admin.updateUserById(
      data.user.id,
      {
        app_metadata: { role },
      }
    );

    if (updateError) {
      throw updateError;
    }

    return updated;
  }
}
