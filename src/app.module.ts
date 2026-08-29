import { Module } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { APP_GUARD } from '@nestjs/core';
import { SupabaseAuthGuard } from './auth/supabase-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { TestModule } from 'test/test.module';
import { InquiriesModule } from './inquiries/inquiries.module';
import { VisitRequestsModule } from './visit-requests/visit-requests.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    TestModule,
  
    ConfigModule.forRoot({ isGlobal: true }),
    // NFR-SEC-15: rate limit public forms. Defaults to 10 req/min per IP,
    // applied globally for now — narrow this to just the public POST
    // routes once curator-only routes sit behind auth.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 10 }]),
    InquiriesModule,
    VisitRequestsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService, { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
