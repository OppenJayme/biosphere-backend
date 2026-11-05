/** Real read-only lot HTTP fixture; no AppModule, dotenv or shared identity/database. */
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
import { SpecimenLotsController } from '../../src/specimen-lots/specimen-lots.controller';
import { SpecimenLotsService } from '../../src/specimen-lots/specimen-lots.service';
import { SUPABASE_CLIENT } from '../../src/supabase/supabase.constants';
import { seedFaqReviewAuthTables } from './faq-review-database-app';

export const HISTORY_CURATOR = '11111111-1111-4111-8111-111111111111';
export const HISTORY_SPECIMEN = '44444444-4444-4444-8444-444444444444';
export const HISTORY_LOT = '55555555-5555-4555-8555-555555555555';
export const HISTORY_UNIT = '66666666-6666-4666-8666-666666666666';
export const HISTORY_EVENT = '77777777-7777-4777-8777-777777777777';
export const OTHER_HISTORY_SPECIMEN = '88888888-8888-4888-8888-888888888888';

export async function seedLotHistoryDatabase(admin: Client) {
  await seedFaqReviewAuthTables(admin);
  for (const file of [
    'database/sql/003_collection.sql',
    'database/sql/005_specimen.sql',
    'database/sql/002_storage_unit.sql',
    'database/sql/002_storage_unitAlter1.sql',
    'database/sql/009_specimen_lot.sql',
    'database/sql/011_specimen_lot_transaction.sql',
  ]) {
    await admin.query(readFileSync(resolve(__dirname, '../..', file), 'utf8'));
  }
  // Simulate the reported database-ahead/client-behind condition independently of the fix.
  await admin.query(
    "ALTER TYPE public.quantity_adjustment_type ADD VALUE 'TEMPORARY_ABSENCE' BEFORE 'DATA_CORRECTION'",
  );
  await admin.query(`
    INSERT INTO specimen(id, created_by, accession_number, common_name) VALUES
      ('${HISTORY_SPECIMEN}', '${HISTORY_CURATOR}', 'TEST-HISTORY-COMPAT', 'Synthetic history specimen'),
      ('${OTHER_HISTORY_SPECIMEN}', '${HISTORY_CURATOR}', 'TEST-HISTORY-OTHER', 'Other synthetic specimen');
    INSERT INTO storage_unit(id, unit_type, label, storage_type, holds_specimens)
      VALUES ('${HISTORY_UNIT}', 'DRAWER', 'Synthetic drawer', 'DRY', true);
    INSERT INTO specimen_lot(id, specimen_id, storage_unit_id, condition_class, quantity, created_by)
      VALUES ('${HISTORY_LOT}', '${HISTORY_SPECIMEN}', '${HISTORY_UNIT}', 'Good', 4, '${HISTORY_CURATOR}');
    INSERT INTO specimen_lot_transaction(id, source_lot_id, transaction_type, quantity_affected, adjustment_type, reason, performed_by)
      VALUES ('${HISTORY_EVENT}', '${HISTORY_LOT}', 'QUANTITY_ADJUSTMENT', 1, 'TEMPORARY_ABSENCE', 'Synthetic retained history', '${HISTORY_CURATOR}');
    GRANT SELECT ON collection, specimen, storage_unit, specimen_lot, specimen_lot_transaction TO service_role;
  `);
}

export async function createLotHistoryDatabaseApp(connectionString: string) {
  const fixture = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([GLOBAL_RATE_LIMIT])],
    controllers: [SpecimenLotsController, AuditController],
    providers: [
      {
        provide: ConfigService,
        useValue: new ConfigService({ DATABASE_URL: connectionString }),
      },
      PrismaService,
      SpecimenLotsService,
      AuthService,
      SecurityAuditService,
      MailService,
      AuditService,
      {
        provide: SUPABASE_CLIENT,
        useValue: {
          auth: {
            getUser: (token: string) => {
              const id =
                token === 'curator-fixture'
                  ? HISTORY_CURATOR
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
