import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

// Guards and routing for the Developer's invitation resend. The curator route
// is covered in user-accounts.e2e-spec.ts and the rules in the unit specs;
// these mocks prove wiring only.
describe('Developer curator invitation resend (e2e)', () => {
  const pendingId = '11111111-1111-4111-8111-111111111111';
  const curatorId = '22222222-2222-4222-8222-222222222222';
  const developerId = '33333333-3333-4333-8333-333333333333';

  let app: INestApplication<App>;
  let inviteUserByEmail: jest.Mock;
  let auditCreate: jest.Mock;

  const sessions: Record<string, unknown> = {
    'auth-curator': { id: curatorId, role: 'CURATOR', status: 'ACTIVE' },
    'auth-developer': { id: developerId, role: 'DEVELOPER', status: 'ACTIVE' },
  };

  beforeAll(() => {
    process.env.FRONTEND_URL ??= 'http://localhost:3000';
  });

  beforeEach(async () => {
    inviteUserByEmail = jest.fn(() => ({
      data: { user: { id: 'auth-pending' } },
      error: null,
    }));
    auditCreate = jest.fn(() => ({}));
    const prismaMock = {
      user_account: {
        findUnique: jest.fn(
          (args: { where: { id?: string; auth_user_id?: string } }) => {
            if (args.where.auth_user_id) {
              return sessions[args.where.auth_user_id];
            }
            return args.where.id === pendingId
              ? {
                  id: pendingId,
                  auth_user_id: 'auth-pending',
                  full_name: 'Juan dela Cruz',
                  role: 'CURATOR',
                  status: 'ACTIVE',
                  avatar_path: null,
                  created_at: new Date('2026-11-01T00:00:00.000Z'),
                  updated_at: new Date('2026-11-01T00:00:00.000Z'),
                }
              : null;
          },
        ),
      },
      users: {
        findMany: jest.fn(() => []),
        findUnique: jest.fn(() => ({
          email: 'juan@usc.edu.ph',
          email_confirmed_at: null,
        })),
      },
      audit_log: { create: auditCreate },
    };
    const getUser = jest.fn((token: string) =>
      sessions[`auth-${token}`]
        ? {
            data: { user: { id: `auth-${token}`, app_metadata: {} } },
            error: null,
          }
        : { data: { user: null }, error: { message: 'Invalid token' } },
    );

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({ auth: { getUser, admin: { inviteUserByEmail } } })
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

  const resend = (token?: string, id = pendingId) => {
    const call = request(app.getHttpServer()).post(
      `/developer/curators/${id}/resend-invitation`,
    );
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };

  it('lets a Developer resend a pending invitation', async () => {
    const response = await resend('developer').expect(200);

    expect(response.body).toMatchObject({
      id: pendingId,
      inviteAccepted: false,
    });
    expect(inviteUserByEmail).toHaveBeenCalledWith('juan@usc.edu.ph', {
      redirectTo: expect.stringMatching(/\/login\/accept-invite$/),
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'RESEND_CURATOR_INVITE',
        status: 'SUCCESS',
      }),
    });
  });

  it('requires a session', async () => {
    await resend().expect(401);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('refuses a curator on the Developer route', async () => {
    await resend('curator').expect(403);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('rejects an id that is not a UUID', async () => {
    await resend('developer', 'not-a-uuid').expect(400);
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('answers 404 for an unknown account', async () => {
    await resend('developer', '44444444-4444-4444-8444-444444444444').expect(
      404,
    );
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });
});
