import { Global, Module } from '@nestjs/common';
import { SupabaseClientProvider } from './supabase-client.provider';
import { StorageService } from './storage.service';

@Global()
@Module({
  providers: [SupabaseClientProvider, StorageService],
  exports: [SupabaseClientProvider, StorageService],
})
export class SupabaseModule {}
