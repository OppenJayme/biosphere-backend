import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SUPABASE_CLIENT } from '../src/supabase/supabase.constants';

// Public General Inquiry and Visit Request submission (SRS §4.8, §4.9) and
// the curator-only routes that read or change those records (NFR-SEC-10).
describe('Inquiries and visit requests (e2e)', () => {
  const curatorToken = 'curator-submissions-token';
  const developerToken = 'developer-submissions-token';
  const curatorAuthId = '11111111-1111-4111-8111-111111111111';
  const curatorAccountId = '22222222-2222-4222-8222-222222222222';
  const developerAuthId = '33333333-3333-4333-8333-333333333333';
  const inquiryId = '44444444-4444-4444-8444-444444444444';
  const visitId = '55555555-5555-4555-8555-555555555555';

  let app: INestApplication<App>;
  let inquiries: Array<Record<string, unknown>>;
  let visits: Array<Record<string, unknown>>;
  let auditCreate: jest.Mock;
  let inquiryWrites: jest.Mock;
  let visitWrites: jest.Mock;

  const validInquiry = {
    name: 'Juan Dela Cruz',
    email: 'juan@example.com',
    message: 'Can we bring a class of 20 for a field trip?',
    consentAccepted: true,
  };
  const validVisit = {
    name: 'Maria Santos',
    email: 'maria@example.com',
    phone: '0917 123 4567',
    organization: 'University of San Carlos',
    purpose: 'Class field trip',
    preferredSchedules: [
      { date: '2030-10-15', startTime: '09:00', endTime: '11:00' },
      { date: '2030-10-16', startTime: '13:00', endTime: '15:00' },
    ],
    visitorCount: 20,
    consentAccepted: true,
  };

  beforeEach(async () => {
    inquiries = [];
    visits = [];
    auditCreate = jest.fn(() => ({}));
    inquiryWrites = jest.fn();
    visitWrites = jest.fn();

    const now = new Date('2026-09-01T00:00:00.000Z');
    const childWrite = (): void => {
      visitWrites('child');
    };
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
                id: '66666666-6666-4666-8666-666666666666',
                role: 'DEVELOPER',
                status: 'ACTIVE',
              };
            }
            return null;
          },
        ),
      },
      inquiry: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          inquiryWrites('create');
          const created = { id: inquiryId, reviewed_by: null, ...data };
          inquiries.push(created);
          return created;
        }),
        findMany: jest.fn(() => inquiries),
        findUnique: jest.fn(
          ({ where }: { where: { id: string } }) =>
            inquiries.find((item) => item.id === where.id) ?? null,
        ),
        update: jest.fn(
          ({ where, data }: { where: { id: string }; data: object }) => {
            inquiryWrites('update');
            const found = inquiries.find((item) => item.id === where.id)!;
            Object.assign(found, data);
            return found;
          },
        ),
        delete: jest.fn(() => {
          inquiryWrites('delete');
        }),
      },
      visit_request: {
        create: jest.fn(
          ({
            data,
          }: {
            data: Record<string, unknown> & {
              preferred_visit_date: { create: object[] };
              visit_request_visitor: { create: object[] };
              visit_request_vehicle: { create: object[] };
            };
          }) => {
            visitWrites('create');
            const created = {
              ...data,
              id: visitId,
              reviewed_by: null,
              created_at: now,
              preferred_visit_date: data.preferred_visit_date.create,
              visit_request_visitor: data.visit_request_visitor.create,
              visit_request_vehicle: data.visit_request_vehicle.create,
            };
            visits.push(created);
            return created;
          },
        ),
        findMany: jest.fn(() => visits),
        findUnique: jest.fn(
          ({ where }: { where: { id: string } }) =>
            visits.find((item) => item.id === where.id) ?? null,
        ),
        update: jest.fn(
          ({ where, data }: { where: { id: string }; data: object }) => {
            visitWrites('update');
            const found = visits.find((item) => item.id === where.id)!;
            Object.assign(found, data);
            return found;
          },
        ),
        delete: jest.fn(() => {
          visitWrites('delete');
        }),
      },
      visit_request_vehicle: { deleteMany: jest.fn(() => childWrite()) },
      visit_request_visitor: { deleteMany: jest.fn(() => childWrite()) },
      preferred_visit_date: { deleteMany: jest.fn(() => childWrite()) },
      audit_log: { create: auditCreate },
      $transaction: jest.fn((callback: (client: unknown) => unknown) =>
        Promise.resolve(callback(prismaMock)),
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
        ? { data: { user: { id, email: 'u@example.com' } }, error: null }
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

  describe('POST /inquiries (public)', () => {
    it('stores a submission without a token and returns only a receipt', async () => {
      const response = await request(app.getHttpServer())
        .post('/inquiries')
        .send(validInquiry)
        .expect(201);

      expect(Object.keys(response.body as object).sort()).toEqual([
        'id',
        'status',
        'submittedAt',
      ]);
      expect(response.body).toMatchObject({ id: inquiryId, status: 'PENDING' });
      expect(inquiries).toHaveLength(1);
      expect(inquiries[0]).toMatchObject({
        full_name: 'Juan Dela Cruz',
        consent_accepted_at: expect.any(Date),
      });
      expect(auditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'SUBMIT_INQUIRY' }),
      });
    });

    it.each([
      ['missing consent', { ...validInquiry, consentAccepted: undefined }],
      ['declined consent', { ...validInquiry, consentAccepted: false }],
      ['an over-long message', { ...validInquiry, message: 'x'.repeat(2001) }],
      ['an over-long name', { ...validInquiry, name: 'x'.repeat(101) }],
      ['an invalid email', { ...validInquiry, email: 'not-an-email' }],
      ['an invalid phone', { ...validInquiry, phone: 'call me' }],
      ['an unknown field', { ...validInquiry, address: 'Cebu' }],
    ])('rejects %s with 400 and stores nothing', async (_label, body) => {
      await request(app.getHttpServer())
        .post('/inquiries')
        .send(body)
        .expect(400);
      expect(inquiryWrites).not.toHaveBeenCalled();
    });
  });

  describe('POST /visit-requests (public)', () => {
    it('stores the request with every preferred schedule', async () => {
      const response = await request(app.getHttpServer())
        .post('/visit-requests')
        .send({
          ...validVisit,
          visitors: [{ firstName: 'Ana', lastName: 'Reyes' }],
          bringingVehicle: true,
          plateNumber: 'ABC 1234',
        })
        .expect(201);

      expect(Object.keys(response.body as object).sort()).toEqual([
        'id',
        'status',
        'submittedAt',
      ]);
      expect(visits[0]).toMatchObject({
        preferred_visit_date: [
          { preference_order: 1 },
          { preference_order: 2 },
        ],
        visit_request_visitor: [{ visitor_name: 'Ana Reyes' }],
        visit_request_vehicle: [{ plate_number: 'ABC 1234' }],
        consent_accepted_at: expect.any(Date),
      });
    });

    it.each([
      ['missing consent', { ...validVisit, consentAccepted: undefined }],
      ['no preferred schedule', { ...validVisit, preferredSchedules: [] }],
      [
        'a malformed time',
        {
          ...validVisit,
          preferredSchedules: [
            { date: '2030-10-15', startTime: '9am', endTime: '11:00' },
          ],
        },
      ],
      [
        'an end time before the start time',
        {
          ...validVisit,
          preferredSchedules: [
            { date: '2030-10-15', startTime: '11:00', endTime: '09:00' },
          ],
        },
      ],
      [
        'a past date',
        {
          ...validVisit,
          preferredSchedules: [
            { date: '2020-01-01', startTime: '09:00', endTime: '11:00' },
          ],
        },
      ],
      [
        'more than five schedules',
        {
          ...validVisit,
          preferredSchedules: [1, 2, 3, 4, 5, 6].map((day) => ({
            date: `2030-10-0${day}`,
            startTime: '09:00',
            endTime: '11:00',
          })),
        },
      ],
      ['zero visitors', { ...validVisit, visitorCount: 0 }],
      ['a vehicle without a plate', { ...validVisit, bringingVehicle: true }],
      ['an over-long purpose', { ...validVisit, purpose: 'x'.repeat(1001) }],
    ])('rejects %s with 400 and stores nothing', async (_label, body) => {
      await request(app.getHttpServer())
        .post('/visit-requests')
        .send(body)
        .expect(400);
      expect(visitWrites).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ['inquiries', inquiryId, { status: 'REVIEWED' }],
    ['visit-requests', visitId, { status: 'APPROVED_BY_CURATOR' }],
  ])('/%s internal routes', (resource, id, patchBody) => {
    const seed = async () => {
      await request(app.getHttpServer())
        .post(`/${resource}`)
        .send(resource === 'inquiries' ? validInquiry : validVisit)
        .expect(201);
      auditCreate.mockClear();
      inquiryWrites.mockClear();
      visitWrites.mockClear();
    };
    const writes = () =>
      resource === 'inquiries' ? inquiryWrites : visitWrites;

    it('require authentication', async () => {
      await seed();
      await request(app.getHttpServer()).get(`/${resource}`).expect(401);
      await request(app.getHttpServer()).get(`/${resource}/${id}`).expect(401);
      await request(app.getHttpServer())
        .patch(`/${resource}/${id}`)
        .send(patchBody)
        .expect(401);
      await request(app.getHttpServer())
        .delete(`/${resource}/${id}`)
        .expect(401);
      expect(writes()).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it('reject Developers with 403 and write nothing', async () => {
      await seed();
      const auth = `Bearer ${developerToken}`;
      await request(app.getHttpServer())
        .get(`/${resource}`)
        .set('Authorization', auth)
        .expect(403);
      await request(app.getHttpServer())
        .get(`/${resource}/${id}`)
        .set('Authorization', auth)
        .expect(403);
      await request(app.getHttpServer())
        .patch(`/${resource}/${id}`)
        .set('Authorization', auth)
        .send(patchBody)
        .expect(403);
      await request(app.getHttpServer())
        .delete(`/${resource}/${id}`)
        .set('Authorization', auth)
        .expect(403);
      expect(writes()).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    });

    it('let a Curator list, read, and change status', async () => {
      await seed();
      const auth = `Bearer ${curatorToken}`;
      const list = await request(app.getHttpServer())
        .get(`/${resource}`)
        .set('Authorization', auth)
        .expect(200);
      expect(list.body).toEqual([expect.objectContaining({ id })]);

      await request(app.getHttpServer())
        .get(`/${resource}/${id}`)
        .set('Authorization', auth)
        .expect(200);

      const patched = await request(app.getHttpServer())
        .patch(`/${resource}/${id}`)
        .set('Authorization', auth)
        .send(patchBody)
        .expect(200);
      expect(patched.body.status).toBe(patchBody.status);
      expect(patched.body.reviewedBy).toBe(curatorAccountId);
    });

    it('reject edits to submitted content', async () => {
      await seed();
      await request(app.getHttpServer())
        .patch(`/${resource}/${id}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ ...patchBody, name: 'Changed Name' })
        .expect(400);
      expect(writes()).not.toHaveBeenCalled();
    });
  });
});
