/** Real read-only history/audit routes, synthetic provider; no AppModule/dotenv. */
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
import { BackupController } from '../../src/backup/backup.controller';
import { BackupService } from '../../src/backup/backup.service';
import { RecoveryHistoryService } from '../../src/backup/recovery-history.service';
import { GLOBAL_RATE_LIMIT } from '../../src/config/rate-limit.config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../../src/supabase/supabase.constants';
import { seedFaqReviewAuthTables } from './faq-review-database-app';

export async function seedBackupHistoryDatabase(admin: Client) {
  await seedFaqReviewAuthTables(admin);
  await admin.query(
    readFileSync(
      resolve(__dirname, '../../database/sql/015_backup_history.sql'),
      'utf8',
    ),
  );
  await admin.query(`
    GRANT SELECT ON backup_history TO service_role;
    INSERT INTO user_account(id, auth_user_id, full_name, role, status) VALUES
      ('33333333-3333-4333-8333-333333333333', '33333333-3333-4333-8333-333333333333', 'Synthetic operator', 'CURATOR', 'ACTIVE');
    INSERT INTO backup_history(id, created_by, backup_type, storage_path, status, started_at, completed_at) VALUES
      ('44444444-4444-4444-8444-444444444441', '11111111-1111-4111-8111-111111111111', 'SCHEDULED_FULL', 'private/synthetic/full.dump', 'COMPLETED', '2026-01-02T00:00:00Z', '2026-01-02T00:01:00Z'),
      ('44444444-4444-4444-8444-444444444442', '11111111-1111-4111-8111-111111111111', 'SCHEDULED_FULL', NULL, 'FAILED', '2026-01-03T00:00:00Z', '2026-01-03T00:01:00Z'),
      ('44444444-4444-4444-8444-444444444443', NULL, 'INCREMENTAL', 'private/synthetic/automated.dump', 'COMPLETED', '2026-01-03T00:00:00Z', '2026-01-03T00:02:00Z'),
      ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 'INCREMENTAL', NULL, 'IN_PROGRESS', '2026-01-04T00:00:00Z', NULL);
  `);
}

export async function createBackupHistoryDatabaseApp(
  connectionString: string,
  recoveryConfig: Record<string, string> = {},
) {
  const fixture = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([GLOBAL_RATE_LIMIT])],
    controllers: [BackupController, AuditController],
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService({
          ...recoveryConfig,
          DATABASE_URL: connectionString,
        }),
      },
      PrismaService,
      BackupService,
      RecoveryHistoryService,
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
                  ? '11111111-1111-4111-8111-111111111111'
                  : token === 'developer-fixture'
                    ? '22222222-2222-4222-8222-222222222222'
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
