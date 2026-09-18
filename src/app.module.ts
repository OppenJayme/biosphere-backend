import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { SupabaseAuthGuard } from './auth/guards/supabase-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { GLOBAL_RATE_LIMIT } from './config/rate-limit.config';
// import { TestModule } from 'test/dev-sandbox.module';
import { InquiriesModule } from './inquiries/inquiries.module';
import { VisitRequestsModule } from './visit-requests/visit-requests.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { SpecimensModule } from './specimens/specimens.module';
import { SpecimenLotsModule } from './specimen-lots/specimen-lots.module';
import { StorageLocationsModule } from './storage-locations/storage-locations.module';
import { DeveloperModule } from './developer/developer.module';
import { FaqModule } from './faq/faq.module';
import { AuditModule } from './audit/audit.module';
import { OfflineSyncModule } from './offline-sync/offline-sync.module';
import { ExhibitsModule } from './exhibit/exhibits.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    PrismaModule,
    AuthModule,
    ExhibitsModule,
    // TestModule,
    // Broad per-IP safety ceiling. Sensitive and public submission routes
    // override this with stricter limits at their controller methods.
    ThrottlerModule.forRoot([GLOBAL_RATE_LIMIT]),
    InquiriesModule,
    VisitRequestsModule,
    DeveloperModule,
    StorageLocationsModule,
    SpecimensModule,
    SpecimenLotsModule,
    FaqModule,
    AuditModule,
    OfflineSyncModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SupabaseAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
