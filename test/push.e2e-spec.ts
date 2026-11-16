import { generateKeyPairSync } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PushService } from '../src/push/push.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

// Real guards, validation and controller; Prisma, Supabase auth and the push
// configuration are synthetic. No push service is contacted.
describe('Push (e2e)', () => {
  const curatorToken = 'curator-push-token';
  const developerToken = 'developer-push-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const endpoint = 'https://fcm.googleapis.com/fcm/send/device-1';

  let app: INestApplication<App>;
  let prismaMock: {
    push_subscription: Record<string, jest.Mock>;
    $transaction: jest.Mock;
  };

  async function start(pushEnv: Record<string, string>) {
    prismaMock = {
      push_subscription: {
        upsert: jest.fn(() => ({})),
        findMany: jest.fn(() => []),
        deleteMany: jest.fn(() => ({ count: 1 })),
      },
      $transaction: jest.fn((callback: (client: unknown) => unknown) =>
        Promise.resolve(callback(prismaMock)),
      ),
    };
    const accounts = {
      findUnique: jest.fn(({ where }: { where: { auth_user_id?: string } }) =>
        where.auth_user_id === curatorAuthId
          ? { id: curatorAccountId, role: 'CURATOR', status: 'ACTIVE' }
          : where.auth_user_id === developerAuthId
            ? {
                id: '66666666-6666-4666-8666-666666666666',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              }
            : null,
      ),
    };
    const getUser = jest.fn((token: string) => {
      const id =
        token === curatorToken
          ? curatorAuthId
          : token === developerToken
            ? developerAuthId
            : null;
      return id
        ? {
            data: { user: { id, email: 'push@example.com', app_metadata: {} } },
            error: null,
          }
        : { data: { user: null }, error: { message: 'Invalid token' } };
    });
    const prisma = {
      ...prismaMock,
      user_account: accounts,
      audit_log: { create: jest.fn(() => ({})) },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({ auth: { getUser } })
      .overrideProvider(PushService)
      .useValue(
        new PushService(
          prisma as unknown as PrismaService,
          {
            get: (key: string) => pushEnv[key],
          } as unknown as ConfigService,
        ),
      )
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
  }

  function enabledEnv() {
    const { privateKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const jwk = privateKey.export({ format: 'jwk' });
    return {
      PUSH_NOTIFICATIONS_ENABLED: 'true',
      VAPID_PUBLIC_KEY: Buffer.concat([
        Buffer.from([0x04]),
        Buffer.from(jwk.x!, 'base64url'),
        Buffer.from(jwk.y!, 'base64url'),
      ]).toString('base64url'),
      VAPID_PRIVATE_KEY: jwk.d!,
      VAPID_SUBJECT: 'mailto:museum@example.com',
    };
  }

  afterEach(async () => {
    await app.close();
  });

  it('is curator-only', async () => {
    await start(enabledEnv());
    const server = app.getHttpServer();
    await request(server).get('/push/config').expect(401);
    await request(server)
      .post('/push/subscriptions')
      .send({ endpoint })
      .expect(401);
    await request(server)
      .get('/push/config')
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
    await request(server)
      .post('/push/subscriptions')
      .set('Authorization', `Bearer ${developerToken}`)
      .send({ endpoint })
      .expect(403);
    expect(prismaMock.push_subscription.upsert).not.toHaveBeenCalled();
  });

  it('registers and removes a device for the signed-in curator only', async () => {
    const env = enabledEnv();
    await start(env);
    const server = app.getHttpServer();
    const auth = `Bearer ${curatorToken}`;

    const config = await request(server)
      .get('/push/config')
      .set('Authorization', auth)
      .expect(200);
    expect(config.body).toEqual({
      enabled: true,
      publicKey: env.VAPID_PUBLIC_KEY,
    });

    await request(server)
      .post('/push/subscriptions')
      .set('Authorization', auth)
      .send({ endpoint })
      .expect(200, { subscribed: true });
    expect(prismaMock.push_subscription.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { user_account_id: curatorAccountId, endpoint },
      }),
    );

    await request(server)
      .delete('/push/subscriptions')
      .set('Authorization', auth)
      .send({ endpoint })
      .expect(200, { subscribed: false });
    expect(prismaMock.push_subscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint, user_account_id: curatorAccountId },
    });
  });

  it('rejects another account id, unknown push services and plain http', async () => {
    await start(enabledEnv());
    const server = app.getHttpServer();
    const auth = `Bearer ${curatorToken}`;
    await request(server)
      .post('/push/subscriptions')
      .set('Authorization', auth)
      .send({ endpoint, userAccountId: '99999999-9999-4999-8999-999999999999' })
      .expect(400);
    await request(server)
      .post('/push/subscriptions')
      .set('Authorization', auth)
      .send({ endpoint: 'https://example.com/collect' })
      .expect(400);
    await request(server)
      .post('/push/subscriptions')
      .set('Authorization', auth)
      .send({ endpoint: 'http://fcm.googleapis.com/fcm/send/x' })
      .expect(400);
    expect(prismaMock.push_subscription.upsert).not.toHaveBeenCalled();
  });

  it('reports push off and refuses devices while the flag is off', async () => {
    await start({});
    const server = app.getHttpServer();
    const auth = `Bearer ${curatorToken}`;
    await request(server)
      .get('/push/config')
      .set('Authorization', auth)
      .expect(200, { enabled: false, publicKey: null });
    await request(server)
      .post('/push/subscriptions')
      .set('Authorization', auth)
      .send({ endpoint })
      .expect(503);
  });
});
