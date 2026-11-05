/** Real public route/service/matcher/guards; only external database/auth adapters are synthetic. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { App } from 'supertest/types';
import { AuthService } from '../../src/auth/auth.service';
import { SupabaseAuthGuard } from '../../src/auth/guards/supabase-auth.guard';
import { RolesGuard } from '../../src/auth/guards/roles.guard';
import { SecurityAuditService } from '../../src/auth/security-audit.service';
import { MailService } from '../../src/mail/mail.service';
import { GLOBAL_RATE_LIMIT } from '../../src/config/rate-limit.config';
import { FaqAssistantController } from '../../src/faq/faq-assistant.controller';
import { FaqAssistantService } from '../../src/faq/faq-assistant.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../../src/supabase/supabase.constants';
import type { SyntheticFaq } from '../fixtures/faq-quality-knowledge';

export async function createFaqQualityApp(entries: SyntheticFaq[]) {
  const fixture = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([GLOBAL_RATE_LIMIT])],
    controllers: [FaqAssistantController],
    providers: [
      FaqAssistantService,
      AuthService,
      SecurityAuditService,
      MailService,
      { provide: ConfigService, useValue: new ConfigService({}) },
      {
        provide: PrismaService,
        useValue: {
          faq_entry: {
            findMany: ({
              where,
              take,
            }: {
              where?: { status?: string };
              take?: number;
            }) =>
              entries
                .filter(
                  (entry) => !where?.status || entry.status === where.status,
                )
                .slice(0, take),
          },
          audit_log: {
            create: () => {
              throw new Error(
                'Public evaluation unexpectedly attempted a write.',
              );
            },
          },
        },
      },
      {
        provide: SUPABASE_CLIENT,
        useValue: {
          auth: {
            getUser: () => {
              throw new Error(
                'Public evaluation unexpectedly requested provider authentication.',
              );
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
