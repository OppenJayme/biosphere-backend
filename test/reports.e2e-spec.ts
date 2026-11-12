import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import readXlsxFile from 'read-excel-file/node';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

describe('Reports (e2e)', () => {
  const curatorToken = 'curator-reports-token';
  const developerToken = 'developer-reports-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';

  let app: INestApplication<App>;
  let auditCreate: jest.Mock;

  beforeEach(async () => {
    auditCreate = jest.fn(() => ({}));
    const prismaMock = {
      user_account: {
        findUnique: jest.fn(
          ({ where }: { where: { auth_user_id?: string; id?: string } }) => {
            if (where.id === curatorAccountId) {
              return { full_name: 'Reports Curator' };
            }
            if (where.auth_user_id === curatorAuthId) {
              return {
                id: curatorAccountId,
                role: 'CURATOR',
                status: 'ACTIVE',
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
      },
      audit_log: {
        create: auditCreate,
        findMany: jest.fn(() => []),
        findFirst: jest.fn(() => null),
        count: jest.fn(() => 0),
      },
      inquiry: {
        count: jest.fn(() => 1),
        findMany: jest.fn(() => [
          {
            created_at: new Date('2026-09-02T00:00:00.000Z'),
            full_name: 'Juan dela Cruz',
            organization_name: 'DepEd',
            email_address: 'juan@example.com',
            contact_number: null,
            inquiry_type: 'Research',
            status: 'PENDING',
            user_account: null,
          },
        ]),
      },
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
            data: {
              user: { id, email: 'reports@example.com', app_metadata: {} },
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

  const inquiryReport = {
    type: 'INQUIRY_SUMMARY',
    format: 'XLSX',
    period: 'MONTHLY',
    month: '2026-09',
  };

  it('is curator-only', async () => {
    await request(app.getHttpServer()).get('/reports').expect(401);
    await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${developerToken}`)
      .send(inquiryReport)
      .expect(403);
  });

  it('lists the five SRS report types and the audit-log export', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports')
      .set('Authorization', `Bearer ${curatorToken}`)
      .expect(200);

    const body = response.body as { type: string }[];
    expect(body.map((item) => item.type)).toEqual([
      'CONSOLIDATED_OPERATIONS',
      'INVENTORY',
      'INQUIRY_SUMMARY',
      'VISIT_REQUEST_SUMMARY',
      'QR_AR_EXHIBITS',
      'AUDIT_LOG',
    ]);
  });

  it('downloads a generated report as an attachment', async () => {
    const response = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send(inquiryReport)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      })
      .expect(200);

    expect(response.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="biosphere_inquiry-summary_2026-09.xlsx"',
    );
    expect(response.headers['cache-control']).toBe('no-store');
    const sheets = await readXlsxFile(response.body as Buffer);
    const cells = sheets.flatMap((sheet) => sheet.data.flat());
    expect(cells).toContain('Juan dela Cruz');
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: curatorAccountId,
        status: 'SUCCESS',
      }),
    });
  });

  it('rejects malformed and unsupported requests with a readable message', async () => {
    const invalidBodies = [
      { ...inquiryReport, type: 'UNKNOWN' },
      { ...inquiryReport, format: 'PDF' },
      { ...inquiryReport, unknown: true },
      { ...inquiryReport, publicDisplay: 'yes' },
    ];
    for (const body of invalidBodies) {
      await request(app.getHttpServer())
        .post('/reports')
        .set('Authorization', `Bearer ${curatorToken}`)
        .send(body)
        .expect(400);
    }

    const response = await request(app.getHttpServer())
      .post('/reports')
      .set('Authorization', `Bearer ${curatorToken}`)
      .send({ ...inquiryReport, visitStatus: 'PENDING' })
      .expect(400);
    expect(response.body.message).toBe(
      'The General Inquiry Summary does not support these filters: visitStatus.',
    );
  });
});
