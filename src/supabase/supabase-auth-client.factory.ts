import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

/**
 * Creates a fresh, isolated Supabase client for a single password-based
 * login request. Unlike getUser(token), signInWithPassword() writes to the
 * client's in-memory session even with persistSession: false — calling it
 * on the shared service-role SUPABASE_CLIENT would let that session leak
 * into concurrent Admin/Storage calls on the same singleton. This client is
 * scoped to one login call and discarded, so it must never be reused or
 * stored across requests.
 */
export function createSupabaseAuthClient(configService: ConfigService) {
  return createClient(
    configService.getOrThrow<string>('SUPABASE_URL'),
    configService.getOrThrow<string>('SUPABASE_ANON_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}
