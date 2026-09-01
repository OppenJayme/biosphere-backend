import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from 'src/supabase/supabase-client.provider';

@Injectable()
export class AuthService {
  constructor(
    @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
  ) {}

  async login(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      throw new UnauthorizedException('Invalid Email or Password');
    }

    return {
      access_token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: (data.user.app_metadata as any)?.role ?? null,
      },
    };
  }

  async inviteUser(email: string, role: 'curator' | 'developer') {
    const { data, error } = await this.supabase.auth.admin.inviteUserByEmail(
      email,
      { data: { role } },
    );

    if (error) throw error;

    return data;
  }
}
