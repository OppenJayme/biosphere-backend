import { generateKeyPairSync } from 'node:crypto';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MAX_DEVICES_PER_ACCOUNT, PushService } from './push.service';

const ACCOUNT = '0b5c9f3e-6a1d-4c2b-9e7f-1a2b3c4d5e6f';
const FCM = 'https://fcm.googleapis.com/fcm/send/device-1';
const MOZ = 'https://updates.push.services.mozilla.com/wpush/v2/device-2';

function vapidEnv() {
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

describe('PushService', () => {
  const prisma = {
    push_subscription: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const fetcher = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  const realFetch = global.fetch;
  let env: Record<string, string | undefined>;

  const create = () =>
    new PushService(
      prisma as unknown as PrismaService,
      {
        get: (key: string) => env[key],
      } as unknown as ConfigService,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    env = vapidEnv();
    prisma.$transaction.mockImplementation(
      (callback: (client: unknown) => unknown) =>
        Promise.resolve(callback(prisma)),
    );
    prisma.push_subscription.findMany.mockResolvedValue([]);
    prisma.push_subscription.deleteMany.mockResolvedValue({ count: 0 });
    prisma.push_subscription.update.mockResolvedValue({});
    global.fetch = fetcher;
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  describe('when off', () => {
    it.each([
      ['the flag is unset', { PUSH_NOTIFICATIONS_ENABLED: undefined }],
      ['the keys are missing', { VAPID_PRIVATE_KEY: undefined }],
      ['the subject is not a contact', { VAPID_SUBJECT: 'museum' }],
    ])(
      'reports disabled, refuses devices and sends nothing if %s',
      async (_label, change) => {
        Object.assign(env, change);
        const service = create();

        expect(service.getConfig()).toEqual({
          enabled: false,
          publicKey: null,
        });
        await expect(service.subscribe(ACCOUNT, FCM)).rejects.toBeInstanceOf(
          ServiceUnavailableException,
        );
        await service.notifyCurators('test');
        expect(prisma.push_subscription.findMany).not.toHaveBeenCalled();
        expect(fetcher).not.toHaveBeenCalled();
      },
    );
  });

  it('exposes only the public key', () => {
    expect(create().getConfig()).toEqual({
      enabled: true,
      publicKey: env.VAPID_PUBLIC_KEY,
    });
  });

  it('registers a device for the signed-in curator and trims old devices', async () => {
    prisma.push_subscription.findMany.mockResolvedValue([{ id: 'oldest' }]);

    await create().subscribe(ACCOUNT, FCM);

    expect(prisma.push_subscription.upsert).toHaveBeenCalledWith({
      where: { endpoint: FCM },
      create: { user_account_id: ACCOUNT, endpoint: FCM },
      update: expect.objectContaining({
        user_account_id: ACCOUNT,
        failure_count: 0,
      }) as unknown,
    });
    expect(prisma.push_subscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_account_id: ACCOUNT },
        skip: MAX_DEVICES_PER_ACCOUNT,
      }),
    );
    expect(prisma.push_subscription.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['oldest'] } },
    });
  });

  it('refuses an endpoint that is not a browser push service', async () => {
    await expect(
      create().subscribe(ACCOUNT, 'https://example.com/collect'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.push_subscription.upsert).not.toHaveBeenCalled();
  });

  it('removes a device only when it belongs to the caller', async () => {
    await create().unsubscribe(ACCOUNT, FCM);
    expect(prisma.push_subscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: FCM, user_account_id: ACCOUNT },
    });
  });

  it('sends an empty, signed push to every active curator device', async () => {
    prisma.push_subscription.findMany.mockResolvedValue([
      { id: 'd1', endpoint: FCM },
      { id: 'd2', endpoint: MOZ },
    ]);
    fetcher.mockResolvedValue(new Response(null, { status: 201 }));

    await create().notifyCurators('new inquiry');

    expect(prisma.push_subscription.findMany).toHaveBeenCalledWith({
      where: { user_account: { role: 'CURATOR', status: 'ACTIVE' } },
      select: { id: true, endpoint: true },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(FCM);
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeUndefined();
    expect(init?.headers).toEqual(
      expect.objectContaining({
        TTL: '3600',
        Urgency: 'high',
        'Content-Length': '0',
        Authorization: expect.stringMatching(
          new RegExp(`^vapid t=.+, k=${env.VAPID_PUBLIC_KEY}$`),
        ) as unknown,
      }),
    );
    expect(prisma.push_subscription.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { last_success_at: expect.any(Date) as unknown, failure_count: 0 },
    });
  });

  it('forgets devices the push service reports gone and counts other failures', async () => {
    prisma.push_subscription.findMany.mockResolvedValue([
      { id: 'gone', endpoint: FCM },
      { id: 'flaky', endpoint: MOZ },
    ]);
    fetcher.mockImplementation((url) =>
      Promise.resolve(new Response(null, { status: url === FCM ? 410 : 500 })),
    );

    await create().notifyCurators('visitor reply');

    expect(prisma.push_subscription.deleteMany).toHaveBeenCalledWith({
      where: { id: 'gone' },
    });
    expect(prisma.push_subscription.update).toHaveBeenCalledWith({
      where: { id: 'flaky' },
      data: { failure_count: { increment: 1 } },
    });
  });

  it('never throws, even when the network or database fails', async () => {
    prisma.push_subscription.findMany.mockResolvedValueOnce([
      { id: 'd1', endpoint: FCM },
    ]);
    fetcher.mockRejectedValue(new Error('network down'));
    prisma.push_subscription.update.mockRejectedValue(new Error('db down'));
    const service = create();
    await expect(service.notifyCurators('x')).resolves.toBeUndefined();

    prisma.push_subscription.findMany.mockRejectedValueOnce(
      new Error('db down'),
    );
    await expect(service.notifyCurators('x')).resolves.toBeUndefined();
  });

  it('does not call a stored endpoint outside the allowlist', async () => {
    prisma.push_subscription.findMany.mockResolvedValue([
      { id: 'bad', endpoint: 'https://example.com/collect' },
    ]);
    await create().notifyCurators('x');
    expect(fetcher).not.toHaveBeenCalled();
    expect(prisma.push_subscription.deleteMany).toHaveBeenCalledWith({
      where: { id: 'bad' },
    });
  });
});
