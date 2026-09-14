import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

import { SUPABASE_CLIENT } from './supabase.constants';

export const SupabaseClientProvider = {
  provide: SUPABASE_CLIENT,

  useFactory: (configService: ConfigService) => {
    return createClient(
      configService.getOrThrow<string>('SUPABASE_URL'),
      configService.getOrThrow<string>('SUPABASE_SECRET_KEY'),
      {
        // This client is shared across all requests on the server, so it
        // must never retain or auto-refresh an individual user's session —
        // every call is authorized per-request via an explicit access token
        // (see AuthService.authenticateAccessToken).
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      },
    );
  },

  inject: [ConfigService],
};
