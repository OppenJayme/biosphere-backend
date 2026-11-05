import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Client } from 'pg';
import type { App } from 'supertest/types';
import { AuthService } from '../../src/auth/auth.service';
import { SupabaseAuthGuard } from '../../src/auth/guards/supabase-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { SecurityAuditService } from '../../src/auth/security-audit.service';
import { MailService } from '../../src/mail/mail.service';
import { GLOBAL_RATE_LIMIT } from '../../src/config/rate-limit.config';
import { NotificationsController } from '../../src/notifications/notifications.controller';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../../src/supabase/supabase.constants';
import { seedFaqReviewAuthTables } from './faq-review-database-app';

export const NOTIFICATION_CURATOR = '11111111-1111-4111-8111-111111111111';
export const OTHER_NOTIFICATION_CURATOR =
  '33333333-3333-4333-8333-333333333333';
export const INQUIRY_ID = '55555555-5555-4555-8555-555555555555';
export const VISIT_ID = '66666666-6666-4666-8666-666666666666';
export const FAILURE_ID = '77777777-7777-4777-8777-777777777777';
const AUTH_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const AUTH_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

export async function seedNotificationsDatabase(admin: Client) {
  await seedFaqReviewAuthTables(admin);
  await admin.query('CREATE ROLE anon; CREATE ROLE authenticated');
  await admin.query(`
    UPDATE user_account SET auth_user_id = '${AUTH_A}' WHERE id = '${NOTIFICATION_CURATOR}';
    INSERT INTO user_account(id, auth_user_id, full_name, role, status)
      VALUES ('${OTHER_NOTIFICATION_CURATOR}', '${AUTH_B}', 'Other synthetic curator', 'CURATOR', 'ACTIVE');
  `);
  for (const file of [
    'database/sql/016_inquiry.sql',
    'database/sql/017_visit_request.sql',
    'prisma/migrations/20261028000000_add_user_notification_state/migration.sql',
  ]) {
    await admin.query(readFileSync(resolve(__dirname, '../..', file), 'utf8'));
  }
  await admin.query('GRANT SELECT ON inquiry, visit_request TO service_role');
}

export async function createNotificationsDatabaseApp(
  url: string,
  enabled = true,
) {
  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([GLOBAL_RATE_LIMIT])],
    controllers: [NotificationsController],
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService({
          DATABASE_URL: url,
          NOTIFICATION_STATE_ENABLED: enabled ? 'true' : 'false',
        }),
      },
      PrismaService,
      NotificationsService,
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
                  ? AUTH_A
                  : token === 'other-curator-fixture'
                    ? AUTH_B
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
  const app = module.createNestApplication<INestApplication<App>>();
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
