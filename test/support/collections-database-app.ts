/** Real collection/audit HTTP fixture. No AppModule, dotenv or deployed provider. */
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
import { PrismaService } from '../../src/prisma/prisma.service';
import { CollectionsController } from '../../src/specimens/collections.controller';
import { CollectionsService } from '../../src/specimens/collections.service';
import { SUPABASE_CLIENT } from '../../src/supabase/supabase.constants';
import { seedFaqReviewAuthTables } from './faq-review-database-app';

export const COLLECTION_UNIQUENESS_SQL = readFileSync(
  resolve(
    __dirname,
    '../../prisma/migrations/20261005000000_enforce_collection_name_uniqueness/migration.sql',
  ),
  'utf8',
);

/** Only the actual collection DDL/migration plus shared minimal synthetic auth/audit dependencies. */
export async function seedCollectionsDatabase(admin: Client) {
  await seedFaqReviewAuthTables(admin);
  await admin.query(
    readFileSync(
      resolve(__dirname, '../../database/sql/003_collection.sql'),
      'utf8',
    ),
  );
  await admin.query(COLLECTION_UNIQUENESS_SQL);
  await admin.query(
    'GRANT SELECT, INSERT, UPDATE ON collection TO service_role',
  );
}

export async function createCollectionsDatabaseApp(connectionString: string) {
  const fixture = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([GLOBAL_RATE_LIMIT])],
    controllers: [CollectionsController, AuditController],
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService({ DATABASE_URL: connectionString }),
      },
      PrismaService,
      CollectionsService,
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
