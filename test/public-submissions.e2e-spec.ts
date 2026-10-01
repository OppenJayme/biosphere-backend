import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { MailService } from '../src/mail/mail.service';
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
  const curatorEmail = 'curator@museum.example';

  // Receipts and curator alerts are sent after the submission response, so
  // let that background work finish before asserting on mail or audit.
  const flushBackgroundWork = () =>
    new Promise((resolve) => setImmediate(resolve));

  let app: INestApplication<App>;
  // A local .env may set alert recipients; these tests use the default of
  // every active curator.
  const configuredRecipients = process.env.CURATOR_ALERT_EMAILS;
  beforeAll(() => {
    process.env.CURATOR_ALERT_EMAILS = '';
  });
  afterAll(() => {
    process.env.CURATOR_ALERT_EMAILS = configuredRecipients;
  });
  let inquiries: Array<Record<string, unknown>>;
  let visits: Array<Record<string, unknown>>;
  let auditCreate: jest.Mock;
  let audits: Array<Record<string, unknown>>;
  let inquiryWrites: jest.Mock;
  let visitWrites: jest.Mock;
  let history: Array<Record<string, unknown>>;
  let historyWrites: jest.Mock;
  let mailSend: jest.Mock;

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
    audits = [];
    auditCreate = jest.fn(({ data }: { data: Record<string, unknown> }) => {
      const created = { created_at: new Date(), ...data };
      audits.push(created);
      return created;
    });
    inquiryWrites = jest.fn();
    visitWrites = jest.fn();
    history = [];
    historyWrites = jest.fn();
    mailSend = jest.fn(() =>
      Promise.resolve({ delivered: true, result: 'SENT <e2e>' }),
    );

    const now = new Date('2026-09-01T00:00:00.000Z');
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
        findMany: jest.fn(() => [
          { full_name: 'Curator One', users: { email: curatorEmail } },
        ]),
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
      },
      visit_request: {
        create: jest.fn(
          ({
            data,
          }: {
            data: Record<string, unknown> & {
              preferred_visit_date: { create: object[] };
              visit_request_visitor?: { create: object[] };
              visit_request_vehicle?: { create: object[] };
            };
          }) => {
            visitWrites('create');
            // A referral creates a request without visitor or vehicle rows.
            const created = {
              source_inquiry_id: null,
              approved_date: null,
              approved_start_time: null,
              approved_end_time: null,
              ...data,
              id: visitId,
              reviewed_by: null,
              created_at: now,
              preferred_visit_date: data.preferred_visit_date.create,
              visit_request_visitor: data.visit_request_visitor?.create ?? [],
              visit_request_vehicle: data.visit_request_vehicle?.create ?? [],
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
      },
      communication_history: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          historyWrites(data.communication_type);
          const created = {
            id: `00000000-0000-4000-8000-${String(history.length + 1).padStart(12, '0')}`,
            inquiry_id: null,
            visit_request_id: null,
            subject: null,
            recipient_email: null,
            delivery_result: null,
            sent_at: null,
            created_at: now,
            ...data,
          };
          history.push(created);
          return created;
        }),
        findMany: jest.fn(
          ({
            where,
          }: {
            where: { inquiry_id?: string; visit_request_id?: string };
          }) =>
            history.filter((entry) =>
              where.inquiry_id
                ? entry.inquiry_id === where.inquiry_id
                : entry.visit_request_id === where.visit_request_id,
            ),
        ),
      },
      audit_log: {
        create: auditCreate,
        findMany: jest.fn(
          ({
            where,
          }: {
            where: {
              action: { in: string[] };
              status: string;
              affected_record_id: { in: string[] };
            };
          }) =>
            audits.filter(
              (entry) =>
                where.action.in.includes(entry.action as string) &&
                entry.status === where.status &&
                where.affected_record_id.in.includes(
                  entry.affected_record_id as string,
                ),
            ),
        ),
      },
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
      .overrideProvider(MailService)
      .useValue({ send: mailSend })
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
        'referenceCode',
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
        'referenceCode',
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

  type Route = {
    method: 'get' | 'post' | 'patch';
    path: string;
    body?: object;
  };
  const referralBody = {
    phone: '0917 123 4567',
    organization: 'University of San Carlos',
    visitorCount: 20,
    preferredSchedules: [
      { date: '2030-10-15', startTime: '09:00', endTime: '11:00' },
    ],
  };
  const noteBody = { message: 'Visitor called to confirm.' };
  const internalRoutes: Record<string, Route[]> = {
    inquiries: [
      { method: 'get', path: '/inquiries' },
      { method: 'get', path: `/inquiries/${inquiryId}` },
      {
        method: 'patch',
        path: `/inquiries/${inquiryId}`,
        body: { status: 'REVIEWED' },
      },
      {
        method: 'post',
        path: `/inquiries/${inquiryId}/referral`,
        body: referralBody,
      },
      { method: 'get', path: `/inquiries/${inquiryId}/history` },
      {
        method: 'post',
        path: `/inquiries/${inquiryId}/notes`,
        body: noteBody,
      },
      {
        method: 'post',
        path: `/inquiries/${inquiryId}/replies`,
        body: { message: 'Reply' },
      },
    ],
    'visit-requests': [
      { method: 'get', path: '/visit-requests' },
      { method: 'get', path: `/visit-requests/${visitId}` },
      {
        method: 'patch',
        path: `/visit-requests/${visitId}`,
        body: { status: 'DECLINED' },
      },
      {
        method: 'patch',
        path: `/visit-requests/${visitId}/approve-schedule`,
        body: { preferenceOrder: 1 },
      },
      {
        method: 'get',
        path: `/visit-requests/${visitId}/campus-entry-summary`,
      },
      { method: 'get', path: `/visit-requests/${visitId}/history` },
      {
        method: 'post',
        path: `/visit-requests/${visitId}/notes`,
        body: noteBody,
      },
      {
        method: 'post',
        path: `/visit-requests/${visitId}/messages`,
        body: { message: 'Message' },
      },
    ],
  };
  const send = (route: Route, token?: string) => {
    const call = request(app.getHttpServer())[route.method](route.path);
    if (token) call.set('Authorization', `Bearer ${token}`);
    return route.body ? call.send(route.body) : call;
  };

  describe.each([
    ['inquiries', inquiryId, { status: 'REVIEWED' }],
    ['visit-requests', visitId, { status: 'DECLINED' }],
  ])('/%s internal routes', (resource, id, patchBody) => {
    const seed = async () => {
      await request(app.getHttpServer())
        .post(`/${resource}`)
        .send(resource === 'inquiries' ? validInquiry : validVisit)
        .expect(201);
      await flushBackgroundWork();
      auditCreate.mockClear();
      inquiryWrites.mockClear();
      visitWrites.mockClear();
    };
    const expectNoWrites = () => {
      expect(inquiryWrites).not.toHaveBeenCalled();
      expect(visitWrites).not.toHaveBeenCalled();
      expect(historyWrites).not.toHaveBeenCalled();
      expect(auditCreate).not.toHaveBeenCalled();
    };

    it('require authentication', async () => {
      await seed();
      for (const route of internalRoutes[resource]) {
        await send(route).expect(401);
      }
      expectNoWrites();
    });

    it('reject Developers with 403 and write nothing', async () => {
      await seed();
      for (const route of internalRoutes[resource]) {
        await send(route, developerToken).expect(403);
      }
      expectNoWrites();
    });

    // Deletion waits for the approved retention policy, so even a finished
    // record and its timeline are kept.
    it('have no DELETE route, even for a finished record', async () => {
      await seed();
      const auth = `Bearer ${curatorToken}`;
      const finish =
        resource === 'inquiries' ? ['REVIEWED', 'CLOSED'] : ['DECLINED'];
      for (const status of finish) {
        await request(app.getHttpServer())
          .patch(`/${resource}/${id}`)
          .set('Authorization', auth)
          .send({ status })
          .expect(200);
      }
      const historyCount = history.length;

      await request(app.getHttpServer())
        .delete(`/${resource}/${id}`)
        .set('Authorization', auth)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/${resource}/${id}`)
        .set('Authorization', auth)
        .expect(200);
      expect(history).toHaveLength(historyCount);
    });

    it('let a Curator list, search, read, and change status', async () => {
      await seed();
      const auth = `Bearer ${curatorToken}`;
      const list = await request(app.getHttpServer())
        .get(`/${resource}?search=field%20trip`)
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
        .send({ ...patchBody, note: 'Handled by phone.' })
        .expect(200);
      expect(patched.body.status).toBe(patchBody.status);
      expect(patched.body.reviewedBy).toBe(curatorAccountId);

      const timeline = await request(app.getHttpServer())
        .get(`/${resource}/${id}/history`)
        .set('Authorization', auth)
        .expect(200);
      expect(timeline.body[0]).toEqual(
        expect.objectContaining({
          type: 'STATUS_CHANGE',
          recordedBy: curatorAccountId,
          message: `Status changed from PENDING to ${patchBody.status}.\n\nHandled by phone.`,
        }),
      );
      // Declining a visit request also emails the visitor; reviewing an
      // inquiry does not.
      expect(timeline.body).toHaveLength(resource === 'inquiries' ? 1 : 2);
    });

    it('record internal notes in the timeline', async () => {
      await seed();
      const auth = `Bearer ${curatorToken}`;
      const note = await request(app.getHttpServer())
        .post(`/${resource}/${id}/notes`)
        .set('Authorization', auth)
        .send(noteBody)
        .expect(201);
      expect(note.body).toMatchObject({
        type: 'NOTE',
        direction: 'INTERNAL',
        message: noteBody.message,
      });

      await request(app.getHttpServer())
        .post(`/${resource}/${id}/notes`)
        .set('Authorization', auth)
        .send({ message: '   ' })
        .expect(400);
    });

    it('reject edits to submitted content', async () => {
      await seed();
      await request(app.getHttpServer())
        .patch(`/${resource}/${id}`)
        .set('Authorization', `Bearer ${curatorToken}`)
        .send({ ...patchBody, name: 'Changed Name' })
        .expect(400);
      expectNoWrites();
    });
  });

  describe('curator workflows', () => {
    const auth = `Bearer ${curatorToken}`;

    it('require review before closing an inquiry', async () => {
      await request(app.getHttpServer())
        .post('/inquiries')
        .send(validInquiry)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/inquiries/${inquiryId}`)
        .set('Authorization', auth)
        .send({ status: 'CLOSED' })
        .expect(400);
      for (const status of ['REVIEWED', 'CLOSED']) {
        await request(app.getHttpServer())
          .patch(`/inquiries/${inquiryId}`)
          .set('Authorization', auth)
          .send({ status })
          .expect(200);
      }
    });

    it('refer an inquiry to a new Pending visit request', async () => {
      await request(app.getHttpServer())
        .post('/inquiries')
        .send(validInquiry)
        .expect(201);

      const referral = await request(app.getHttpServer())
        .post(`/inquiries/${inquiryId}/referral`)
        .set('Authorization', auth)
        .send(referralBody)
        .expect(201);

      expect(referral.body).toMatchObject({
        visitRequestId: visitId,
        inquiry: {
          status: 'TURNED_TO_VISIT_REQUEST',
          visitRequestId: visitId,
        },
      });
      expect(visits).toEqual([
        expect.objectContaining({
          source_inquiry_id: inquiryId,
          status: 'PENDING',
          contact_person: validInquiry.name,
          email_address: validInquiry.email,
        }),
      ]);
      expect(history.map((entry) => entry.communication_type)).toEqual([
        'REFERRAL',
        'REFERRAL',
      ]);

      // Turned to Visit Request is final.
      await request(app.getHttpServer())
        .patch(`/inquiries/${inquiryId}`)
        .set('Authorization', auth)
        .send({ status: 'CLOSED' })
        .expect(400);
      await request(app.getHttpServer())
        .post(`/inquiries/${inquiryId}/referral`)
        .set('Authorization', auth)
        .send(referralBody)
        .expect(400);
      expect(visits).toHaveLength(1);
    });

    it('approve a schedule, summarise campus entry, and complete the visit', async () => {
      await request(app.getHttpServer())
        .post('/visit-requests')
        .send(validVisit)
        .expect(201);
      await flushBackgroundWork();
      mailSend.mockClear();

      await request(app.getHttpServer())
        .get(`/visit-requests/${visitId}/campus-entry-summary`)
        .set('Authorization', auth)
        .expect(400);
      // Approval has its own action; PATCH cannot set it.
      await request(app.getHttpServer())
        .patch(`/visit-requests/${visitId}`)
        .set('Authorization', auth)
        .send({ status: 'APPROVED_BY_CURATOR' })
        .expect(400);

      const approved = await request(app.getHttpServer())
        .patch(`/visit-requests/${visitId}/approve-schedule`)
        .set('Authorization', auth)
        .send({ preferenceOrder: 2 })
        .expect(200);
      expect(approved.body).toMatchObject({
        status: 'APPROVED_BY_CURATOR',
        approvedSchedule: {
          date: '2030-10-16',
          startTime: '13:00',
          endTime: '15:00',
        },
      });
      expect(approved.body.preferredSchedules).toHaveLength(2);

      const summary = await request(app.getHttpServer())
        .get(`/visit-requests/${visitId}/campus-entry-summary`)
        .set('Authorization', auth)
        .expect(200);
      expect(summary.body).toMatchObject({
        visitRequestId: visitId,
        organization: validVisit.organization,
        approvedSchedule: { date: '2030-10-16' },
        visitorCount: 20,
      });

      await request(app.getHttpServer())
        .patch(`/visit-requests/${visitId}`)
        .set('Authorization', auth)
        .send({ status: 'SUBMITTED_FOR_CAMPUS_ENTRY' })
        .expect(200);
      // Once submitted for campus entry, a request can only be completed.
      for (const status of ['DECLINED', 'CANCELLED']) {
        await request(app.getHttpServer())
          .patch(`/visit-requests/${visitId}`)
          .set('Authorization', auth)
          .send({ status })
          .expect(400);
      }
      await request(app.getHttpServer())
        .patch(`/visit-requests/${visitId}`)
        .set('Authorization', auth)
        .send({ status: 'COMPLETED' })
        .expect(200);
      // Completed is final.
      await request(app.getHttpServer())
        .patch(`/visit-requests/${visitId}`)
        .set('Authorization', auth)
        .send({ status: 'CANCELLED' })
        .expect(400);

      const timeline = await request(app.getHttpServer())
        .get(`/visit-requests/${visitId}/history`)
        .set('Authorization', auth)
        .expect(200);
      expect(
        (timeline.body as Array<{ type: string; message: string }>).map(
          (entry) => `${entry.type}: ${entry.message.split('\n')[0]}`,
        ),
      ).toEqual([
        'STATUS_CHANGE: Status changed from PENDING to APPROVED_BY_CURATOR.',
        'STATUS_UPDATE_EMAIL: Hello Maria Santos,',
        'STATUS_CHANGE: Status changed from APPROVED_BY_CURATOR to SUBMITTED_FOR_CAMPUS_ENTRY.',
        'STATUS_CHANGE: Status changed from SUBMITTED_FOR_CAMPUS_ENTRY to COMPLETED.',
      ]);
      // After the submission receipt and alert, only the approval emailed.
      expect(mailSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('visitor emails', () => {
    const auth = `Bearer ${curatorToken}`;

    it('email the approved schedule on approval and record the result', async () => {
      await request(app.getHttpServer())
        .post('/visit-requests')
        .send(validVisit)
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/visit-requests/${visitId}/approve-schedule`)
        .set('Authorization', auth)
        .send({
          preferenceOrder: 1,
          visitorMessage: 'Please arrive 15 minutes early.',
        })
        .expect(200);

      expect(mailSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: validVisit.email,
          subject:
            'Your BioSphere museum visit schedule has been approved (Ref 55555555)',
          text: expect.stringContaining('Please arrive 15 minutes early.'),
        }),
      );
      const timeline = await request(app.getHttpServer())
        .get(`/visit-requests/${visitId}/history`)
        .set('Authorization', auth)
        .expect(200);
      expect(timeline.body[1]).toMatchObject({
        direction: 'OUTBOUND',
        type: 'STATUS_UPDATE_EMAIL',
        recipientEmail: validVisit.email,
        deliveryResult: 'SENT <e2e>',
      });
    });

    it('keep the decision when the email fails', async () => {
      mailSend.mockResolvedValue({ delivered: false, result: 'FAILED 500' });
      await request(app.getHttpServer())
        .post('/visit-requests')
        .send(validVisit)
        .expect(201);

      const declined = await request(app.getHttpServer())
        .patch(`/visit-requests/${visitId}`)
        .set('Authorization', auth)
        .send({ status: 'DECLINED' })
        .expect(200);

      expect(declined.body.status).toBe('DECLINED');
      expect(history.at(-1)).toMatchObject({
        direction: 'OUTBOUND',
        delivery_result: 'FAILED 500',
        sent_at: null,
      });
    });

    it('skip the email when notifyVisitor is false', async () => {
      await request(app.getHttpServer())
        .post('/visit-requests')
        .send(validVisit)
        .expect(201);
      await flushBackgroundWork();
      mailSend.mockClear();

      await request(app.getHttpServer())
        .patch(`/visit-requests/${visitId}`)
        .set('Authorization', auth)
        .send({ status: 'CANCELLED', notifyVisitor: false })
        .expect(200);

      expect(mailSend).not.toHaveBeenCalled();
    });

    it('send a curator reply to an inquiry and a message on a visit request', async () => {
      await request(app.getHttpServer())
        .post('/inquiries')
        .send(validInquiry)
        .expect(201);
      await request(app.getHttpServer())
        .post('/visit-requests')
        .send(validVisit)
        .expect(201);

      const reply = await request(app.getHttpServer())
        .post(`/inquiries/${inquiryId}/replies`)
        .set('Authorization', auth)
        .send({ message: 'Yes, a class of 20 is welcome.' })
        .expect(201);
      expect(reply.body).toMatchObject({
        direction: 'OUTBOUND',
        type: 'MESSAGE_EMAIL',
        recipientEmail: validInquiry.email,
      });

      await request(app.getHttpServer())
        .post(`/visit-requests/${visitId}/messages`)
        .set('Authorization', auth)
        .send({ subject: 'Visitor list', message: 'Please send the list.' })
        .expect(201);
      expect(mailSend).toHaveBeenLastCalledWith(
        expect.objectContaining({ subject: 'Visitor list' }),
      );

      // Neither message changes the status.
      expect(inquiries[0].status).toBe('PENDING');
      expect(visits[0].status).toBe('PENDING');
      await request(app.getHttpServer())
        .post(`/inquiries/${inquiryId}/replies`)
        .set('Authorization', auth)
        .send({ message: '   ' })
        .expect(400);
    });

    it('return the reference code on public receipts', async () => {
      const receipt = await request(app.getHttpServer())
        .post('/inquiries')
        .send(validInquiry)
        .expect(201);
      expect(receipt.body.referenceCode).toBe('44444444');
    });
  });
  describe('new submission alerts', () => {
    const auth = `Bearer ${curatorToken}`;

    it.each([
      [
        'inquiries',
        validInquiry,
        'We received your BioSphere museum inquiry (Ref 44444444)',
        'New general inquiry received (Ref 44444444)',
      ],
      [
        'visit-requests',
        validVisit,
        'We received your BioSphere visit request (Ref 55555555)',
        'New visit request received (Ref 55555555)',
      ],
    ])(
      'POST /%s sends a receipt and alerts curators',
      async (resource, body, receiptSubject, alertSubject) => {
        await request(app.getHttpServer())
          .post(`/${resource}`)
          .send(body)
          .expect(201);
        await flushBackgroundWork();

        expect(mailSend).toHaveBeenCalledWith(
          expect.objectContaining({ to: body.email, subject: receiptSubject }),
        );
        expect(mailSend).toHaveBeenCalledWith(
          expect.objectContaining({
            to: curatorEmail,
            subject: alertSubject,
            text: expect.not.stringContaining(body.name) as string,
          }),
        );
        expect(auditCreate).toHaveBeenCalledWith({
          data: expect.objectContaining({
            action: 'ALERT_CURATORS',
            details: { recipients: 1, delivered: 1 },
            status: 'SUCCESS',
          }),
        });
      },
    );

    it('keep the submission and surface the failed emails in-system', async () => {
      mailSend.mockResolvedValue({ delivered: false, result: 'FAILED 500' });

      await request(app.getHttpServer())
        .post('/inquiries')
        .send(validInquiry)
        .expect(201);
      await flushBackgroundWork();

      expect(inquiries).toHaveLength(1);
      expect(auditCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ALERT_CURATORS',
          status: 'FAILED',
        }),
      });

      const feed = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', auth)
        .expect(200);
      expect(feed.body).toMatchObject({ total: 3, emailFailures: 2 });
      expect(
        (feed.body.items as Array<{ type: string; title: string }>)
          .filter((item) => item.type === 'SUBMISSION_EMAIL_FAILED')
          .map((item) => item.title)
          .sort(),
      ).toEqual([
        'Curator alert email was not delivered',
        'Receipt email to the visitor was not delivered',
      ]);
    });

    it('GET /notifications lists pending submissions for curators only', async () => {
      await request(app.getHttpServer())
        .post('/inquiries')
        .send(validInquiry)
        .expect(201);
      await request(app.getHttpServer())
        .post('/visit-requests')
        .send(validVisit)
        .expect(201);

      await request(app.getHttpServer()).get('/notifications').expect(401);
      await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(403);

      const feed = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', auth)
        .expect(200);
      expect(feed.body).toMatchObject({
        total: 2,
        pendingInquiries: 1,
        pendingVisitRequests: 1,
      });
      expect(
        (feed.body.items as Array<{ recordType: string; recordId: string }>)
          .map((item) => `${item.recordType}:${item.recordId}`)
          .sort(),
      ).toEqual([`inquiry:${inquiryId}`, `visit_request:${visitId}`]);
      expect(JSON.stringify(feed.body)).not.toContain(validInquiry.email);

      await request(app.getHttpServer())
        .get('/notifications?limit=0')
        .set('Authorization', auth)
        .expect(400);
    });
  });

  describe('date filters', () => {
    const auth = `Bearer ${curatorToken}`;

    it.each([
      '/inquiries?submittedFrom=2026-09-30&submittedTo=2026-09-01',
      '/inquiries?submittedFrom=09/01/2026',
      '/visit-requests?visitDateFrom=2026-02-30',
      '/visit-requests?visitDateFrom=2026-10-31&visitDateTo=2026-10-01',
    ])('reject %s with 400', async (path) => {
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', auth)
        .expect(400);
    });

    it('accept valid submitted and visit date ranges', async () => {
      await request(app.getHttpServer())
        .get('/inquiries?submittedFrom=2026-09-01&submittedTo=2026-09-30')
        .set('Authorization', auth)
        .expect(200);
      await request(app.getHttpServer())
        .get(
          '/visit-requests?status=APPROVED_BY_CURATOR&visitDateFrom=2026-10-01&visitDateTo=2026-10-31',
        )
        .set('Authorization', auth)
        .expect(200);
    });
  });
});
