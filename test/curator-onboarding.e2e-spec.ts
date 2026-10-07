import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

// An invited curator's session from the invite link, before and after they
// set a password (REQ-4.1-07, REQ-4.1-11).
describe('Curator onboarding (e2e)', () => {
  const inviteToken = 'invite-session-token';
  const authUserId = '11111111-1111-4111-8111-111111111111';
  const accountId = '22222222-2222-4222-8222-222222222222';

  let app: INestApplication<App>;
  let onboardingPending: boolean;
  let passwordSet: boolean;
  let auditCreate: jest.Mock;

  beforeEach(async () => {
    onboardingPending = true;
    passwordSet = false;
    auditCreate = jest.fn(() => ({}));

    const prismaMock = {
      user_account: {
        findUnique: jest.fn(() => ({
          id: accountId,
          role: 'CURATOR',
          status: 'ACTIVE',
        })),
        findMany: jest.fn(() => []),
      },
      users: {
        count: jest.fn(() => (passwordSet ? 1 : 0)),
        findMany: jest.fn(() => []),
      },
      audit_log: { create: auditCreate },
    };
    const getUser = jest.fn((token: string) =>
      token === inviteToken
        ? {
            data: {
              user: {
                id: authUserId,
                email: 'new@usc.edu.ph',
                app_metadata: {
                  role: 'CURATOR',
                  onboarding_pending: onboardingPending,
                },
              },
            },
            error: null,
          }
        : { data: { user: null }, error: { message: 'Invalid token' } },
    );
    const updateUserById = jest.fn(
      (
        _id: string,
        attrs: { app_metadata: { onboarding_pending: boolean } },
      ) => {
        onboardingPending = attrs.app_metadata.onboarding_pending;
        return { data: {}, error: null };
      },
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({ auth: { getUser, admin: { updateUserById } } })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  function auditEntries() {
    return (
      auditCreate.mock.calls as [{ data: Record<string, unknown> }][]
    ).map(([arg]) => arg.data);
  }

  it('denies protected curator access while the invite password is not set', async () => {
    await request(app.getHttpServer())
      .get('/user-accounts')
      .set('Authorization', `Bearer ${inviteToken}`)
      .expect(403);

    expect(auditEntries()).toContainEqual(
      expect.objectContaining({
        action: 'ACCESS_DENIED',
        status: 'DENIED',
        details: expect.objectContaining({ reason: 'ONBOARDING_INCOMPLETE' }),
      }),
    );
  });

  it('will not complete onboarding before a password exists', async () => {
    await request(app.getHttpServer())
      .post('/auth/onboarding/complete')
      .set('Authorization', `Bearer ${inviteToken}`)
      .expect(409);

    expect(onboardingPending).toBe(true);
    await request(app.getHttpServer())
      .get('/user-accounts')
      .set('Authorization', `Bearer ${inviteToken}`)
      .expect(403);
  });

  it('grants protected access once the password is set and onboarding completed', async () => {
    passwordSet = true;

    await request(app.getHttpServer())
      .post('/auth/onboarding/complete')
      .set('Authorization', `Bearer ${inviteToken}`)
      .expect(200, { onboardingComplete: true });

    await request(app.getHttpServer())
      .get('/user-accounts')
      .set('Authorization', `Bearer ${inviteToken}`)
      .expect(200);

    expect(auditEntries()).toContainEqual({
      user_id: accountId,
      affected_record_id: accountId,
      affected_record_type: 'user_account',
      action: 'ONBOARDING_COMPLETED',
      module: 'auth',
      details: { method: 'PASSWORD_SETUP' },
      status: 'SUCCESS',
    });
    const audited = JSON.stringify(auditEntries());
    expect(audited).not.toContain(inviteToken);
    expect(audited).not.toMatch(/password"|token"|secret/i);
  });

  it('rejects completion without a valid session', async () => {
    await request(app.getHttpServer())
      .post('/auth/onboarding/complete')
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/onboarding/complete')
      .set('Authorization', 'Bearer not-a-session')
      .expect(401);
    expect(onboardingPending).toBe(true);
  });
});
