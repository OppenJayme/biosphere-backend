/** Narrow real Nest/Prisma fixture; no AppModule, dotenv or deployed identity provider. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { AuditController } from '../../src/audit/audit.controller';
import { AuditService } from '../../src/audit/audit.service';
import { AuthService } from '../../src/auth/auth.service';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { SupabaseAuthGuard } from '../../src/auth/guards/supabase-auth.guard';
import { SecurityAuditService } from '../../src/auth/security-audit.service';
import { MailService } from '../../src/mail/mail.service';
import { GLOBAL_RATE_LIMIT } from '../../src/config/rate-limit.config';
import { OfflineSyncController } from '../../src/offline-sync/offline-sync.controller';
import { OfflineSyncService } from '../../src/offline-sync/offline-sync.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SpecimenAccessionService } from '../../src/specimens/specimen-accession.service';
import { SpecimenCatalogingService } from '../../src/specimens/specimen-cataloging.service';
import { SpecimensService } from '../../src/specimens/specimens.service';
import { SUPABASE_CLIENT } from '../../src/supabase/supabase.constants';
import { seedFaqReviewAuthTables } from './faq-review-database-app';

export const OFFLINE_CURATOR = '11111111-1111-4111-8111-111111111111';
export const OTHER_OFFLINE_CURATOR = '33333333-3333-4333-8333-333333333333';
const CURATOR_AUTH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CURATOR_AUTH_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export async function seedOfflineSyncDatabase(admin: Client) {
  await seedFaqReviewAuthTables(admin);
  // Actual core DDL and relevant migrations; auth/audit dependencies above are minimal fixtures.
  for (const file of [
    'database/sql/003_collection.sql',
    'database/sql/005_specimen.sql',
    'prisma/migrations/20260927000000_enforce_accession_number_uniqueness/migration.sql',
    'prisma/migrations/20260913000000_add_offline_draft_sync/migration.sql',
  ]) {
    await admin.query(readFileSync(resolve(__dirname, '../..', file), 'utf8'));
  }
  await admin.query(`
    UPDATE user_account SET auth_user_id = '${CURATOR_AUTH_ID}' WHERE id = '${OFFLINE_CURATOR}';
    INSERT INTO user_account(id, auth_user_id, full_name, role, status)
      VALUES ('${OTHER_OFFLINE_CURATOR}', '${OTHER_CURATOR_AUTH_ID}', 'Other synthetic curator', 'CURATOR', 'ACTIVE');
    GRANT SELECT, INSERT, UPDATE ON collection, specimen, offline_draft_sync TO service_role;
  `);
}

export async function createOfflineSyncDatabaseApp(connectionString: string) {
  const fixture = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([GLOBAL_RATE_LIMIT])],
    controllers: [OfflineSyncController, AuditController],
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService({ DATABASE_URL: connectionString }),
      },
      PrismaService,
      OfflineSyncService,
      SpecimensService,
      SpecimenCatalogingService,
      SpecimenAccessionService,
      AuditService,
      AuthService,
      SecurityAuditService,
      MailService,
      {
        provide: SUPABASE_CLIENT,
        useValue: {
          auth: {
            getUser: (token: string) => {
              const id =
                token === 'curator-fixture'
                  ? CURATOR_AUTH_ID
                  : token === 'other-curator-fixture'
                    ? OTHER_CURATOR_AUTH_ID
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
