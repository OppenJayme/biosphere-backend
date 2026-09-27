import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Exhibit QR codes (e2e)', () => {
  const curatorToken = 'curator-qr-token';
  const developerToken = 'developer-qr-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const exhibitId = '44444444-4444-4444-8444-444444444444';
  const qrExhibitBaseUrl = 'https://qr.example.test';

  let app: INestApplication<App>;
  let exhibitRecord: Record<string, unknown> | null;
  let auditCreate: jest.Mock;
  let originalQrExhibitBaseUrl: string | undefined;

  beforeEach(async () => {
    originalQrExhibitBaseUrl = process.env.QR_EXHIBIT_BASE_URL;
    process.env.QR_EXHIBIT_BASE_URL = qrExhibitBaseUrl;

    exhibitRecord = {
      id: exhibitId,
      public_slug: 'six-legged-carabao',
      status: 'PUBLISHED',
      archived_at: null,
    };
    auditCreate = jest.fn(() => ({}));

    const prismaMock = {
      user_account: {
        findUnique: jest.fn(
          ({ where }: { where: { auth_user_id: string } }) => {
            if (where.auth_user_id === curatorAuthId) {
              return {
                id: curatorAccountId,
                role: 'CURATOR',
                status: 'ACTIVE',
              };
            }
            if (where.auth_user_id === developerAuthId) {
              return {
                id: '55555555-5555-4555-8555-555555555555',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
      },
      exhibit: {
        findUnique: jest.fn(() => exhibitRecord),
      },
      audit_log: { create: auditCreate },
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
            data: { user: { id, email: 'qr@example.com', app_metadata: {} } },
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
    if (originalQrExhibitBaseUrl === undefined) {
      delete process.env.QR_EXHIBIT_BASE_URL;
    } else {
      process.env.QR_EXHIBIT_BASE_URL = originalQrExhibitBaseUrl;
    }
  });

  it('requires an authenticated active Curator', async () => {
    await request(app.getHttpServer())
      .get(`/exhibits/${exhibitId}/qr`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/exhibits/${exhibitId}/qr`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect(403);
  });

  it('rejects a malformed exhibit UUID', () =>
    request(app.getHttpServer())
      .get('/exhibits/not-a-uuid/qr')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400));

  it('returns the public URL backing the QR code', async () => {
    const response = await request(app.getHttpServer())
      .get(`/exhibits/${exhibitId}/qr`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        exhibitId,
        publicSlug: 'six-legged-carabao',
      }),
    );
    expect(response.body.publicUrl).toContain('six-legged-carabao');
    expect(response.body.publicUrl).toBe(
      `${qrExhibitBaseUrl}/exhibits/six-legged-carabao`,
    );
  });

  it('downloads a PNG QR code and records an audit entry', async () => {
    const response = await request(app.getHttpServer())
      .get(`/exhibits/${exhibitId}/qr/png`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('image/png');
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'GENERATE_EXHIBIT_QR',
        details: { format: 'PNG' },
      }),
    });
  }, 15_000);

  it('downloads an SVG QR code and records an audit entry', async () => {
    const response = await request(app.getHttpServer())
      .get(`/exhibits/${exhibitId}/qr/svg`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    expect(response.headers['content-type']).toContain('image/svg+xml');
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'GENERATE_EXHIBIT_QR',
        details: { format: 'SVG' },
      }),
    });
  });

  it('404s for an unknown exhibit', () => {
    exhibitRecord = null;
    return request(app.getHttpServer())
      .get(`/exhibits/${exhibitId}/qr`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(404);
  });

  it('rejects QR generation for an archived exhibit', async () => {
    exhibitRecord = {
      id: exhibitId,
      public_slug: 'six-legged-carabao',
      status: 'PUBLISHED',
      archived_at: new Date('2026-01-01T00:00:00.000Z'),
    };

    await request(app.getHttpServer())
      .get(`/exhibits/${exhibitId}/qr/png`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
    await request(app.getHttpServer())
      .get(`/exhibits/${exhibitId}/qr/svg`)
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(400);
  });
});
