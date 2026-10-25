/** Narrow real Nest/Prisma fixture; intentionally does not import AppModule/ConfigModule.forRoot. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Client } from 'pg';
import { AuthService } from '../../src/auth/auth.service';
import { SupabaseAuthGuard } from '../../src/auth/guards/supabase-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { SecurityAuditService } from '../../src/auth/security-audit.service';
import { GLOBAL_RATE_LIMIT } from '../../src/config/rate-limit.config';
import {
  FaqReviewQueueController,
  FaqReviewSubmissionController,
} from '../../src/faq/faq-review.controller';
import { FaqReviewService } from '../../src/faq/faq-review.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../../src/supabase/supabase.constants';
import type { App } from 'supertest/types';

const CURATOR = '11111111-1111-4111-8111-111111111111';
const DEVELOPER = '22222222-2222-4222-8222-222222222222';

/** Minimal dependency fixtures, not a claim to replay the full historical migration chain. */
export async function seedFaqReviewAuthTables(admin: Client) {
  await admin.query(`
    CREATE TYPE audit_result AS ENUM ('SUCCESS', 'FAILED', 'DENIED');
    CREATE TYPE user_role AS ENUM ('CURATOR', 'DEVELOPER');
    CREATE TYPE account_status AS ENUM ('ACTIVE', 'INACTIVE');
    CREATE TABLE user_account (
      id UUID PRIMARY KEY, auth_user_id UUID NOT NULL UNIQUE,
      full_name TEXT NOT NULL, role user_role NOT NULL, status account_status NOT NULL,
      avatar_path TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID REFERENCES user_account(id),
      affected_record_id UUID, affected_record_type VARCHAR(100), action VARCHAR(100) NOT NULL,
      module VARCHAR(100) NOT NULL, details JSONB, status audit_result NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    INSERT INTO user_account(id, auth_user_id, full_name, role, status) VALUES
      ('${CURATOR}', '${CURATOR}', 'Synthetic curator', 'CURATOR', 'ACTIVE'),
      ('${DEVELOPER}', '${DEVELOPER}', 'Synthetic developer', 'DEVELOPER', 'ACTIVE');
    GRANT USAGE ON SCHEMA public TO service_role;
    GRANT SELECT ON user_account TO service_role;
    GRANT SELECT, INSERT ON audit_log TO service_role;
  `);
}

export async function createFaqReviewDatabaseApp(connectionString: string) {
  const config = new ConfigService({
    DATABASE_URL: connectionString,
    FAQ_REVIEW_ENABLED: 'true',
  });
  const fixture = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([GLOBAL_RATE_LIMIT])],
    controllers: [FaqReviewQueueController, FaqReviewSubmissionController],
    providers: [
      { provide: ConfigService, useValue: config },
      PrismaService,
      FaqReviewService,
      AuthService,
      SecurityAuditService,
      {
        provide: SUPABASE_CLIENT,
        useValue: {
          auth: {
            getUser: (token: string) => {
              const id =
                token === 'curator-fixture'
                  ? CURATOR
                  : token === 'developer-fixture'
                    ? DEVELOPER
                    : null;
              return {
                data: { user: id ? { id } : null },
                error: id ? null : { message: 'Synthetic denial' },
              };
            },
          },
        },
      },
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_GUARD, useClass: SupabaseAuthGuard },
      { provide: APP_GUARD, useClass: RolesGuard },
    ],
  }).compile();
  const app = fixture.createNestApplication<INestApplication<App>>();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  try {
    await app.listen(0, '127.0.0.1');
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}
