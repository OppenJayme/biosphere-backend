import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

// Guards, validation and routing for curator handover (REQ-4.1-09). The
// museum decided on 2026-11-07 that curators do not deactivate each other,
// so handover is Developer-only and the curator status route is gone. The
// mocks prove wiring only; rules are covered by the service spec.
describe('Curator handover (e2e)', () => {
  const curatorId = '11111111-1111-4111-8111-111111111111';
  const successorId = '22222222-2222-4222-8222-222222222222';
  const developerId = '33333333-3333-4333-8333-333333333333';

  let app: INestApplication<App>;
  let update: jest.Mock;

  const sessions: Record<string, unknown> = {
    'auth-curator': { id: curatorId, role: 'CURATOR', status: 'ACTIVE' },
    'auth-developer': { id: developerId, role: 'DEVELOPER', status: 'ACTIVE' },
  };

  const curatorRow = (id: string, status = 'ACTIVE') => ({
    id,
    auth_user_id: `auth-${id}`,
    full_name: 'Curator',
    role: 'CURATOR',
    status,
    avatar_path: null,
    created_at: new Date('2026-11-01T00:00:00.000Z'),
    updated_at: new Date('2026-11-01T00:00:00.000Z'),
  });

  beforeEach(async () => {
    update = jest.fn(() => curatorRow(curatorId, 'INACTIVE'));
    const findUnique = jest.fn(
      (args: { where: { id?: string; auth_user_id?: string } }) => {
        if (args.where.auth_user_id) return sessions[args.where.auth_user_id];
        return args.where.id ? curatorRow(args.where.id) : null;
      },
    );
    const transaction = {
      user_account: { findUnique, update },
      users: {
        findMany: jest.fn((args: { where: { id: { in: string[] } } }) =>
          args.where.id.in.map((id) => ({ id, raw_app_meta_data: {} })),
        ),
        findUnique: jest.fn(() => ({ last_sign_in_at: new Date() })),
      },
      audit_log: { create: jest.fn(() => ({})) },
    };
    const prismaMock = {
      ...transaction,
      $transaction: jest.fn((operation: (tx: unknown) => unknown) =>
        operation(transaction),
      ),
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
      .useValue({ auth: { getUser } })
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

  const handover = (token?: string) => {
    const call = request(app.getHttpServer()).post(
      '/developer/curators/handover',
    );
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };
  const body = {
    outgoingCuratorId: curatorId,
    successorCuratorId: successorId,
    authorizationReason: 'Curator retired',
  };

  it('lets a Developer hand over a curator account', async () => {
    const response = await handover('developer').send(body).expect(200);

    expect(response.body).toMatchObject({
      outgoing: { id: curatorId, status: 'INACTIVE' },
      successor: { id: successorId, status: 'ACTIVE' },
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('requires a session', async () => {
    await handover().send(body).expect(401);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a curator', async () => {
    await handover('curator').send(body).expect(403);
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    { ...body, authorizationReason: '   ' },
    { outgoingCuratorId: curatorId, successorCuratorId: successorId },
    { ...body, outgoingCuratorId: 'not-a-uuid' },
    { ...body, authorizationReason: 'x'.repeat(501) },
    { ...body, status: 'INACTIVE' },
  ])('rejects %j', async (invalid) => {
    await handover('developer').send(invalid).expect(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('no longer lets a curator change another curator status', async () => {
    await request(app.getHttpServer())
      .patch(`/user-accounts/${successorId}/status`)
      .set('Authorization', 'Bearer curator')
      .send({ status: 'INACTIVE', reason: 'Left the museum' })
      .expect(404);
    expect(update).not.toHaveBeenCalled();
  });
});
