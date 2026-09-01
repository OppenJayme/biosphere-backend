import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';

export const SupabaseClientProvider = {
  provide: SUPABASE_CLIENT,

  useFactory: (configService: ConfigService) => {
    return createClient(
      configService.getOrThrow<string>('SUPABASE_URL'),
      configService.getOrThrow<string>('SUPABASE_SECRET_KEY'),
    );
  },

  inject: [ConfigService],
};
