import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

import { SUPABASE_CLIENT } from './supabase.constants';

export const SupabaseClientProvider = {
  provide: SUPABASE_CLIENT,

  useFactory: (configService: ConfigService) => {
    return createClient(
      configService.getOrThrow<string>('SUPABASE_URL'),
      configService.getOrThrow<string>('SUPABASE_SECRET_KEY'),
      {
        // @supabase/supabase-js requires Node's native WebSocket (Node 22+)
        // for its Realtime client. Provide the `ws` package as the transport
        // so the client still boots on Node 20, which this project targets.
        realtime: {
          transport: WebSocket as unknown as typeof globalThis.WebSocket,
        },
      },
    );
  },

  inject: [ConfigService],
};
