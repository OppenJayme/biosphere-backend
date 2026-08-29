import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ConfigService } from "@nestjs/config";

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';

export const SupabaseClientProvider = {
    provide: SUPABASE_CLIENT,
    useFactory: (configService: ConfigService): SupabaseClient => {
        return createClient(
            configService.getOrThrow<string>('SUPABASE_URL'),
            configService.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
        );
    },
    inject: [ConfigService],
};