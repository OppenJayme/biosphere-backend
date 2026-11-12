import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('User accounts (e2e)', () => {
  const curatorToken = 'curator-user-accounts-token';
  const developerToken = 'developer-user-accounts-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const inactiveToken = 'inactive-curator-user-accounts-token';
  const inactiveAuthId = '44444444-4444-4444-8444-444444444444';
  const invitedAuthId = '55555555-5555-4555-8555-555555555555';
  const pendingAccountId = '88888888-8888-4888-8888-888888888888';

  let app: INestApplication<App>;
  let findMany: jest.Mock;
  let create: jest.Mock;
  let auditCreate: jest.Mock;
  let inviteUserByEmail: jest.Mock;

  beforeAll(() => {
    process.env.FRONTEND_URL ??= 'http://localhost:3000';
  });

  beforeEach(async () => {
    create = jest.fn(() => ({
      id: '88888888-8888-4888-8888-888888888888',
      auth_user_id: invitedAuthId,
      full_name: 'Juan dela Cruz',
      status: 'ACTIVE',
      created_at: new Date('2026-10-07T00:00:00.000Z'),
      users: {
        email: 'juan@usc.edu.ph',
        last_sign_in_at: null,
      },
    }));
    auditCreate = jest.fn(() => ({}));
    findMany = jest.fn(() => [
      {
        id: '22222222-2222-4222-8222-222222222222',
        auth_user_id: curatorAuthId,
        full_name: 'Maria Santos',
        status: 'ACTIVE',
        created_at: new Date('2026-09-01T00:00:00.000Z'),
        users: {
          email: 'maria@usc.edu.ph',
          last_sign_in_at: new Date('2026-10-01T02:00:00.000Z'),
        },
      },
    ]);
    const prismaMock = {
      user_account: {
        findUnique: jest.fn(
          ({ where }: { where: { auth_user_id?: string; id?: string } }) => {
            if (where.id === pendingAccountId) {
              return {
                id: pendingAccountId,
                auth_user_id: invitedAuthId,
                full_name: 'Juan dela Cruz',
                role: 'CURATOR',
                status: 'ACTIVE',
              };
            }
            if (where.auth_user_id === curatorAuthId) {
              return {
                id: '22222222-2222-4222-8222-222222222222',
                role: 'CURATOR',
                status: 'ACTIVE',
              };
            }
            if (where.auth_user_id === inactiveAuthId) {
              return {
                id: '77777777-7777-4777-8777-777777777777',
                role: 'CURATOR',
                status: 'INACTIVE',
              };
            }
            if (where.auth_user_id === developerAuthId) {
              return {
                id: '66666666-6666-4666-8666-666666666666',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
        findMany,
        create,
        findUniqueOrThrow: jest.fn(() => ({
          id: pendingAccountId,
          auth_user_id: invitedAuthId,
          full_name: 'Juan dela Cruz',
          status: 'ACTIVE',
          created_at: new Date('2026-10-07T00:00:00.000Z'),
          users: { email: 'juan@usc.edu.ph', last_sign_in_at: null },
        })),
      },
      users: {
        findUnique: jest.fn(() => ({
          email: 'juan@usc.edu.ph',
          email_confirmed_at: null,
        })),
        findFirst: jest.fn(() => null),
        findMany: jest.fn(() => [{ id: curatorAuthId }]),
      },
      audit_log: { create: auditCreate },
    };
    inviteUserByEmail = jest.fn(() => ({
      data: { user: { id: invitedAuthId } },
      error: null,
    }));
    const admin = {
      inviteUserByEmail,
      updateUserById: jest.fn(() => ({ data: {}, error: null })),
      deleteUser: jest.fn(() => ({ data: {}, error: null })),
    };
    const getUser = jest.fn((token: string) => {
      const id =
        token === curatorToken
          ? curatorAuthId
          : token === developerToken
            ? developerAuthId
            : token === inactiveToken
              ? inactiveAuthId
              : null;
      return id
        ? {
            data: {
              user: { id, email: 'accounts@example.com', app_metadata: {} },
            },
            error: null,
          }
        : { data: { user: null }, error: { message: 'Invalid token' } };
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({ auth: { getUser, admin } })
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

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/user-accounts').expect(401);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('rejects developers', async () => {
    await request(app.getHttpServer())
      .get('/user-accounts')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('returns only curator accounts to a curator without caching', async () => {
    const response = await request(app.getHttpServer())
      .get('/user-accounts')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: 'CURATOR' } }),
    );
    expect(response.body).toEqual([
      {
        id: '22222222-2222-4222-8222-222222222222',
        fullName: 'Maria Santos',
        email: 'maria@usc.edu.ph',
        status: 'ACTIVE',
        inviteAccepted: true,
        lastSignInAt: '2026-10-01T02:00:00.000Z',
        createdAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
  });

  describe('POST /user-accounts/invitations', () => {
    const body = { email: ' Juan@USC.edu.ph ', fullName: 'Juan dela Cruz' };

    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .post('/user-accounts/invitations')
        .send(body)
        .expect(401);
      expect(inviteUserByEmail).not.toHaveBeenCalled();
    });

    it('rejects developers', async () => {
      await request(app.getHttpServer())
        .post('/user-accounts/invitations')
        .set('Authorization', `Bearer ${developerToken}`)
        .send(body)
        .expect(403);
      expect(inviteUserByEmail).not.toHaveBeenCalled();
    });

    it('rejects an inactive curator', async () => {
      const response = await request(app.getHttpServer())
        .post('/user-accounts/invitations')
        .set('Authorization', `Bearer ${inactiveToken}`)
        .send(body);
      expect([401, 403]).toContain(response.status);
      expect(inviteUserByEmail).not.toHaveBeenCalled();
    });

    it('rejects an invalid body or an attempt to pick the role', async () => {
      for (const invalid of [
        { email: 'nope', fullName: 'Juan' },
        { ...body, role: 'DEVELOPER' },
      ]) {
        await request(app.getHttpServer())
          .post('/user-accounts/invitations')
          .set('Authorization', `Bearer ${curatorToken}`)
          .send(invalid)
          .expect(400);
      }
      expect(inviteUserByEmail).not.toHaveBeenCalled();
    });

    it('lets a curator invite another curator', async () => {
      const response = await request(app.getHttpServer())
        .post('/user-accounts/invitations')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send(body)
        .expect(201);

      expect(inviteUserByEmail).toHaveBeenCalledWith(
        'juan@usc.edu.ph',
        expect.objectContaining({ data: { role: 'CURATOR' } }),
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: 'CURATOR', status: 'ACTIVE' }),
        }),
      );
      expect(auditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'INVITE_CURATOR',
          status: 'SUCCESS',
          user_id: '22222222-2222-4222-8222-222222222222',
        }),
      });
      expect(response.body).toMatchObject({
        id: '88888888-8888-4888-8888-888888888888',
        email: 'juan@usc.edu.ph',
        inviteAccepted: false,
      });
    });
  });

  describe('POST /user-accounts/:id/resend-invitation', () => {
    const path = `/user-accounts/${pendingAccountId}/resend-invitation`;

    it('rejects unauthenticated requests', async () => {
      await request(app.getHttpServer()).post(path).expect(401);
      expect(inviteUserByEmail).not.toHaveBeenCalled();
    });

    it('rejects developers', async () => {
      await request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(403);
      expect(inviteUserByEmail).not.toHaveBeenCalled();
    });

    it('rejects an id that is not a UUID', async () => {
      await request(app.getHttpServer())
        .post('/user-accounts/not-a-uuid/resend-invitation')
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(400);
      expect(inviteUserByEmail).not.toHaveBeenCalled();
    });

    it('lets a curator resend a pending invitation', async () => {
      const response = await request(app.getHttpServer())
        .post(path)
        .set('Authorization', `Bearer ${curatorToken}`)
        .expect(200);

      expect(inviteUserByEmail).toHaveBeenCalledWith('juan@usc.edu.ph', {
        redirectTo: expect.stringMatching(/\/login\/accept-invite$/),
      });
      expect(create).not.toHaveBeenCalled();
      expect(auditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'RESEND_CURATOR_INVITE',
          affected_record_id: pendingAccountId,
          status: 'SUCCESS',
          user_id: '22222222-2222-4222-8222-222222222222',
        }),
      });
      expect(response.body).toMatchObject({
        id: pendingAccountId,
        inviteAccepted: false,
      });
    });
  });
});
