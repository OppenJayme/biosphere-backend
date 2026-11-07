import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

// Guards, validation and routing for curator status changes (REQ-4.1-08).
// The mocks prove wiring only; rules are covered by the service spec.
describe('Curator account status (e2e)', () => {
  const curatorId = '11111111-1111-4111-8111-111111111111';
  const targetId = '22222222-2222-4222-8222-222222222222';
  const developerId = '33333333-3333-4333-8333-333333333333';

  let app: INestApplication<App>;
  let update: jest.Mock;

  const accounts: Record<string, unknown> = {
    'auth-curator': { id: curatorId, role: 'CURATOR', status: 'ACTIVE' },
    'auth-developer': { id: developerId, role: 'DEVELOPER', status: 'ACTIVE' },
  };

  beforeEach(async () => {
    const row = {
      id: targetId,
      auth_user_id: 'auth-target',
      full_name: 'Target Curator',
      status: 'ACTIVE',
      created_at: new Date('2026-11-01T00:00:00.000Z'),
      users: { email: 'target@usc.edu.ph', last_sign_in_at: null },
    };
    update = jest.fn(() => row);
    const findUnique = jest.fn(
      (args: { where: { id?: string; auth_user_id?: string } }) => {
        if (args.where.auth_user_id) return accounts[args.where.auth_user_id];
        if (args.where.id === curatorId) return { status: 'ACTIVE' };
        return { ...row, status: 'INACTIVE', role: 'CURATOR' };
      },
    );
    const transaction = {
      user_account: { findUnique, update },
      audit_log: { create: jest.fn(() => ({})) },
    };
    const prismaMock = {
      ...transaction,
      users: { findMany: jest.fn(() => []) },
      $transaction: jest.fn((operation: (tx: unknown) => unknown) =>
        operation(transaction),
      ),
    };
    const getUser = jest.fn((token: string) =>
      accounts[`auth-${token}`]
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

  const patch = (id: string, token?: string) => {
    const call = request(app.getHttpServer()).patch(
      `/user-accounts/${id}/status`,
    );
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };
  const body = { status: 'ACTIVE', reason: 'Returned to the museum' };

  it('lets a curator reactivate another curator', async () => {
    const response = await patch(targetId, 'curator').send(body).expect(200);

    expect(response.body).toMatchObject({ id: targetId, status: 'ACTIVE' });
    expect(update).toHaveBeenCalledTimes(1);
  });

  // The Curator answered on 2026-11-07 that curators should not turn off
  // another curator's account; handover or the Developer route does that.
  it('refuses to let a curator deactivate another curator', async () => {
    await patch(targetId, 'curator')
      .send({ status: 'INACTIVE', reason: 'Left the museum' })
      .expect(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('requires a session', async () => {
    await patch(targetId).send(body).expect(401);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a Developer', async () => {
    await patch(targetId, 'developer').send(body).expect(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a change to your own account', async () => {
    await patch(curatorId, 'curator').send(body).expect(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('requires a reason', async () => {
    await patch(targetId, 'curator').send({ status: 'ACTIVE' }).expect(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a malformed id', async () => {
    await patch('not-a-uuid', 'curator').send(body).expect(400);
  });
});
