import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from './../src/supabase/supabase.constants';

const SECRET = 'e2e-webhook-secret';
const ID = '<receipt-1@smtp-relay.mailin.fr>';
const ENTRY = '11111111-1111-4111-8111-111111111111';
const basic = (password: string) =>
  `Basic ${Buffer.from(`brevo:${password}`).toString('base64')}`;

describe('Brevo delivery webhook (e2e)', () => {
  let app: INestApplication<App>;
  const history = { findFirst: jest.fn(), updateMany: jest.fn() };

  async function start(secret: string | undefined) {
    if (secret === undefined) delete process.env.BREVO_WEBHOOK_SECRET;
    else process.env.BREVO_WEBHOOK_SECRET = secret;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ communication_history: history })
      .overrideProvider(SUPABASE_CLIENT)
      .useValue({})
      .compile();
    app = moduleFixture.createNestApplication();
    // Same pipe as main.ts: the raw webhook body must still get through it.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  }

  beforeEach(() => {
    jest.clearAllMocks();
    history.findFirst.mockResolvedValue({
      id: ENTRY,
      delivery_result: `SENT ${ID}`,
    });
    history.updateMany.mockResolvedValue({ count: 1 });
  });

  afterEach(async () => {
    await app.close();
    delete process.env.BREVO_WEBHOOK_SECRET;
  });

  it('is switched off (404) when no secret is configured', async () => {
    await start(undefined);
    await request(app.getHttpServer())
      .post('/mail-events/brevo')
      .set('Authorization', basic(SECRET))
      .send({ event: 'delivered', 'message-id': ID })
      .expect(404);
    expect(history.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a missing or wrong secret without touching the database', async () => {
    await start(SECRET);
    await request(app.getHttpServer())
      .post('/mail-events/brevo')
      .send({ event: 'delivered', 'message-id': ID })
      .expect(401);
    await request(app.getHttpServer())
      .post('/mail-events/brevo')
      .set('Authorization', basic('wrong'))
      .send({ event: 'delivered', 'message-id': ID })
      .expect(401);
    await request(app.getHttpServer())
      .post('/mail-events/brevo')
      .set('Authorization', 'Bearer wrong')
      .send({ event: 'delivered', 'message-id': ID })
      .expect(401);
    expect(history.findFirst).not.toHaveBeenCalled();
  });

  it('applies events sent with Basic auth, the form a Brevo webhook URL uses', async () => {
    await start(SECRET);
    await request(app.getHttpServer())
      .post('/mail-events/brevo')
      .set('Authorization', basic(SECRET))
      .send({
        event: 'delivered',
        'message-id': ID,
        email: 'visitor@example.com',
        subject: 'We received your BioSphere museum inquiry (Ref 9A81836F)',
      })
      .expect(200, { received: 1, updated: 1 });
    expect(history.updateMany).toHaveBeenCalledWith({
      where: { id: ENTRY, delivery_result: `SENT ${ID}` },
      data: { delivery_result: `SENT ${ID} · delivered` },
    });
  });

  it('accepts a Bearer token and batched events', async () => {
    await start(SECRET);
    await request(app.getHttpServer())
      .post('/mail-events/brevo')
      .set('Authorization', `Bearer ${SECRET}`)
      .send([
        { event: 'request', 'message-id': ID },
        { event: 'deferred', 'message-id': ID, reason: 'Quota' },
      ])
      .expect(200, { received: 1, updated: 1 });
  });
});
