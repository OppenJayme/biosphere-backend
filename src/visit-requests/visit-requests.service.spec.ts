import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVisitRequestDto } from './dto/create-visit-request.dto';
import { VisitRequestStatus } from './entities/visit-request.entity';
import { VisitRequestsService } from './visit-requests.service';

const VISIT_ID = '11111111-1111-4111-8111-111111111111';
const CURATOR_ID = '22222222-2222-4222-8222-222222222222';
const INQUIRY_ID = '33333333-3333-4333-8333-333333333333';
const ENTRY_ID = '44444444-4444-4444-8444-444444444444';
const CREATED_AT = new Date('2026-09-01T00:00:00.000Z');

const visitRecord = (overrides: Record<string, unknown> = {}) => ({
  id: VISIT_ID,
  reviewed_by: null,
  source_inquiry_id: null,
  contact_person: 'Maria Santos',
  email_address: 'maria@example.com',
  contact_number: '09171234567',
  organization_name: 'USC',
  address: null,
  purpose_of_visit: 'Class field trip',
  visitor_count: 20,
  miscellaneous_details: null,
  additional_notes: null,
  consent_accepted_at: CREATED_AT,
  status: 'PENDING',
  approved_date: null,
  approved_start_time: null,
  approved_end_time: null,
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  preferred_visit_date: [
    {
      id: 'p1',
      visit_id: VISIT_ID,
      preferred_date: new Date('2030-10-15T00:00:00.000Z'),
      preferred_start_time: new Date('1970-01-01T09:00:00.000Z'),
      preferred_end_time: new Date('1970-01-01T11:00:00.000Z'),
      preference_order: 1,
    },
  ],
  visit_request_visitor: [],
  visit_request_vehicle: [],
  ...overrides,
});

const validDto = (
  overrides: Partial<CreateVisitRequestDto> = {},
): CreateVisitRequestDto => ({
  name: 'Maria Santos',
  email: 'maria@example.com',
  phone: '09171234567',
  organization: 'USC',
  purpose: 'Class field trip',
  preferredSchedules: [
    { date: '2030-10-15', startTime: '09:00', endTime: '11:00' },
    { date: '2030-10-16', startTime: '13:00', endTime: '15:00' },
  ],
  visitorCount: 20,
  consentAccepted: true,
  ...overrides,
});

describe('VisitRequestsService', () => {
  const visitDelegate = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const historyDelegate = { create: jest.fn(), findMany: jest.fn() };
  const auditDelegate = { create: jest.fn() };
  const prisma = {
    visit_request: visitDelegate,
    communication_history: historyDelegate,
    audit_log: auditDelegate,
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (client: unknown) => unknown) =>
      Promise.resolve(callback(prisma)),
  );
  let service: VisitRequestsService;

  beforeEach(() => {
    jest.clearAllMocks();
    historyDelegate.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: ENTRY_ID,
          inquiry_id: null,
          subject: null,
          recipient_email: null,
          delivery_result: null,
          sent_at: null,
          created_at: CREATED_AT,
          ...data,
        }),
    );
    service = new VisitRequestsService(prisma as unknown as PrismaService);
  });

  it('stores every preferred schedule, visitor and vehicle as child records', async () => {
    visitDelegate.create.mockResolvedValue(visitRecord());

    const receipt = await service.create(
      validDto({
        visitors: [
          { firstName: 'Ana', lastName: 'Reyes' },
          { firstName: 'Ben' },
        ],
        bringingVehicle: true,
        plateNumber: 'ABC 1234',
        carBrand: 'Toyota',
      }),
    );

    expect(receipt).toEqual({
      id: VISIT_ID,
      status: VisitRequestStatus.PENDING,
      submittedAt: CREATED_AT,
    });
    const data = visitDelegate.create.mock.calls[0][0].data;
    expect(data.consent_accepted_at).toEqual(expect.any(Date));
    expect(data.preferred_visit_date.create).toEqual([
      {
        preferred_date: new Date('2030-10-15T00:00:00.000Z'),
        preferred_start_time: new Date('1970-01-01T09:00:00.000Z'),
        preferred_end_time: new Date('1970-01-01T11:00:00.000Z'),
        preference_order: 1,
      },
      expect.objectContaining({ preference_order: 2 }),
    ]);
    expect(data.visit_request_visitor.create).toEqual([
      { visitor_name: 'Ana Reyes' },
      { visitor_name: 'Ben' },
    ]);
    expect(data.visit_request_vehicle.create).toEqual([
      { plate_number: 'ABC 1234', vehicle_brand: 'Toyota', vehicle_type: null },
    ]);
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: null,
        action: 'SUBMIT_VISIT_REQUEST',
        details: { preferredScheduleCount: 2, visitorCount: 20 },
      }),
    });
  });

  it.each([
    [
      'end time not after start time',
      { date: '2030-10-15', startTime: '11:00', endTime: '11:00' },
    ],
    [
      'a past date',
      { date: '2020-01-01', startTime: '09:00', endTime: '11:00' },
    ],
    [
      'an impossible calendar date',
      { date: '2030-02-30', startTime: '09:00', endTime: '11:00' },
    ],
  ])('rejects %s without writing', async (_label, schedule) => {
    await expect(
      service.create(validDto({ preferredSchedules: [schedule] })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(visitDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate preferred schedules', async () => {
    const schedule = {
      date: '2030-10-15',
      startTime: '09:00',
      endTime: '11:00',
    };
    await expect(
      service.create(validDto({ preferredSchedules: [schedule, schedule] })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects more named visitors than visitorCount', async () => {
    await expect(
      service.create(
        validDto({
          visitorCount: 1,
          visitors: [{ firstName: 'Ana' }, { firstName: 'Ben' }],
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects vehicle details without bringingVehicle', async () => {
    await expect(
      service.create(validDto({ plateNumber: 'ABC 1234' })),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps stored rows, including schedules, to the curator entity', async () => {
    visitDelegate.findUnique.mockResolvedValue(visitRecord());

    await expect(service.findOne(VISIT_ID)).resolves.toEqual(
      expect.objectContaining({
        name: 'Maria Santos',
        preferredSchedules: [
          {
            date: '2030-10-15',
            startTime: '09:00',
            endTime: '11:00',
            preferenceOrder: 1,
          },
        ],
        status: VisitRequestStatus.PENDING,
      }),
    );
  });

  it('searches contact person, email, organization, and purpose', async () => {
    visitDelegate.findMany.mockResolvedValue([]);

    await service.findAll({
      status: VisitRequestStatus.PENDING,
      search: 'maria',
    });

    const search = { contains: 'maria', mode: 'insensitive' };
    expect(visitDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: VisitRequestStatus.PENDING,
          OR: [
            { contact_person: search },
            { email_address: search },
            { organization_name: search },
            { purpose_of_visit: search },
          ],
        },
      }),
    );
  });

  it('changes status, records it in the timeline, and audits it', async () => {
    visitDelegate.findUnique.mockResolvedValue(visitRecord());
    visitDelegate.update.mockResolvedValue(
      visitRecord({ status: 'DECLINED', reviewed_by: CURATOR_ID }),
    );

    const result = await service.update(
      VISIT_ID,
      { status: VisitRequestStatus.DECLINED, note: 'Museum closed that week.' },
      CURATOR_ID,
    );

    expect(result.status).toBe(VisitRequestStatus.DECLINED);
    expect(historyDelegate.create).toHaveBeenCalledWith({
      data: {
        visit_request_id: VISIT_ID,
        recorded_by: CURATOR_ID,
        direction: 'INTERNAL',
        communication_type: 'STATUS_CHANGE',
        message:
          'Status changed from PENDING to DECLINED.\n\nMuseum closed that week.',
      },
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: CURATOR_ID,
        action: 'UPDATE_VISIT_REQUEST_STATUS',
        details: { previousStatus: 'PENDING', status: 'DECLINED' },
      }),
    });
  });

  it.each([
    ['PENDING', VisitRequestStatus.SUBMITTED_FOR_CAMPUS_ENTRY],
    ['PENDING', VisitRequestStatus.COMPLETED],
    ['APPROVED_BY_CURATOR', VisitRequestStatus.DECLINED],
    ['CANCELLED', VisitRequestStatus.COMPLETED],
    ['COMPLETED', VisitRequestStatus.CANCELLED],
  ] as const)('rejects %s -> %s and writes nothing', async (from, to) => {
    visitDelegate.findUnique.mockResolvedValue(visitRecord({ status: from }));

    await expect(
      service.update(VISIT_ID, { status: to }, CURATOR_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(visitDelegate.update).not.toHaveBeenCalled();
    expect(historyDelegate.create).not.toHaveBeenCalled();
  });

  describe('approveSchedule', () => {
    const twoOptions = visitRecord({
      preferred_visit_date: [
        ...visitRecord().preferred_visit_date,
        {
          id: 'p2',
          visit_id: VISIT_ID,
          preferred_date: new Date('2030-10-16T00:00:00.000Z'),
          preferred_start_time: new Date('1970-01-01T13:00:00.000Z'),
          preferred_end_time: new Date('1970-01-01T15:00:00.000Z'),
          preference_order: 2,
        },
      ],
    });

    it('copies the chosen option onto the request and keeps every option', async () => {
      visitDelegate.findUnique.mockResolvedValue(twoOptions);
      visitDelegate.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...twoOptions, ...data }),
      );

      const result = await service.approveSchedule(
        VISIT_ID,
        { preferenceOrder: 2 },
        CURATOR_ID,
      );

      expect(visitDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'APPROVED_BY_CURATOR',
            approved_date: new Date('2030-10-16T00:00:00.000Z'),
            approved_start_time: new Date('1970-01-01T13:00:00.000Z'),
            approved_end_time: new Date('1970-01-01T15:00:00.000Z'),
            reviewed_by: CURATOR_ID,
          }),
        }),
      );
      expect(result.approvedSchedule).toEqual({
        date: '2030-10-16',
        startTime: '13:00',
        endTime: '15:00',
      });
      expect(result.preferredSchedules).toHaveLength(2);
      expect(historyDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          communication_type: 'STATUS_CHANGE',
          message:
            'Status changed from PENDING to APPROVED_BY_CURATOR.\n\n' +
            'Approved option 2: 2030-10-16 13:00-15:00.',
        }),
      });
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'APPROVE_VISIT_SCHEDULE',
          details: {
            previousStatus: 'PENDING',
            status: 'APPROVED_BY_CURATOR',
            preferenceOrder: 2,
          },
        }),
      });
    });

    it('rejects an option number the request does not have', async () => {
      visitDelegate.findUnique.mockResolvedValue(visitRecord());

      await expect(
        service.approveSchedule(VISIT_ID, { preferenceOrder: 3 }, CURATOR_ID),
      ).rejects.toThrow('no preferred option 3');
      expect(visitDelegate.update).not.toHaveBeenCalled();
    });

    it('rejects an option whose date has passed', async () => {
      visitDelegate.findUnique.mockResolvedValue(
        visitRecord({
          preferred_visit_date: [
            {
              ...visitRecord().preferred_visit_date[0],
              preferred_date: new Date('2020-01-01T00:00:00.000Z'),
            },
          ],
        }),
      );

      await expect(
        service.approveSchedule(VISIT_ID, { preferenceOrder: 1 }, CURATOR_ID),
      ).rejects.toThrow('already in the past');
      expect(visitDelegate.update).not.toHaveBeenCalled();
    });

    it('only approves a Pending request', async () => {
      visitDelegate.findUnique.mockResolvedValue(
        visitRecord({ status: 'DECLINED' }),
      );

      await expect(
        service.approveSchedule(VISIT_ID, { preferenceOrder: 1 }, CURATOR_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(visitDelegate.update).not.toHaveBeenCalled();
    });
  });

  describe('getCampusEntrySummary', () => {
    it('consolidates the approved schedule, visitors, and vehicles', async () => {
      visitDelegate.findUnique.mockResolvedValue(
        visitRecord({
          status: 'APPROVED_BY_CURATOR',
          approved_date: new Date('2030-10-15T00:00:00.000Z'),
          approved_start_time: new Date('1970-01-01T09:00:00.000Z'),
          approved_end_time: new Date('1970-01-01T11:00:00.000Z'),
          miscellaneous_details: 'Cameras',
          visit_request_visitor: [{ visitor_name: 'Ana Reyes' }],
          visit_request_vehicle: [
            {
              plate_number: 'ABC 1234',
              vehicle_brand: 'Toyota',
              vehicle_type: 'Van',
            },
          ],
        }),
      );

      await expect(service.getCampusEntrySummary(VISIT_ID)).resolves.toEqual({
        visitRequestId: VISIT_ID,
        status: VisitRequestStatus.APPROVED_BY_CURATOR,
        organization: 'USC',
        contactPerson: 'Maria Santos',
        email: 'maria@example.com',
        phone: '09171234567',
        purpose: 'Class field trip',
        approvedSchedule: {
          date: '2030-10-15',
          startTime: '09:00',
          endTime: '11:00',
        },
        visitorCount: 20,
        visitors: [{ name: 'Ana Reyes' }],
        vehicles: [{ plateNumber: 'ABC 1234', brand: 'Toyota', type: 'Van' }],
        equipment: 'Cameras',
      });
    });

    it('is unavailable until a schedule is approved', async () => {
      visitDelegate.findUnique.mockResolvedValue(visitRecord());

      await expect(
        service.getCampusEntrySummary(VISIT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it('creates a Pending request from an inquiry referral and notes its source', async () => {
    visitDelegate.create.mockResolvedValue(
      visitRecord({ source_inquiry_id: INQUIRY_ID }),
    );

    const id = await service.createFromReferral(
      prisma as unknown as Parameters<
        VisitRequestsService['createFromReferral']
      >[0],
      {
        sourceInquiryId: INQUIRY_ID,
        name: 'Maria Santos',
        email: 'maria@example.com',
        phone: '09171234567',
        organization: 'USC',
        purpose: null,
        visitorCount: 20,
        preferredSchedules: validDto().preferredSchedules,
        consentAcceptedAt: CREATED_AT,
      },
      CURATOR_ID,
    );

    expect(id).toBe(VISIT_ID);
    expect(visitDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source_inquiry_id: INQUIRY_ID,
        status: 'PENDING',
        consent_accepted_at: CREATED_AT,
        preferred_visit_date: {
          create: [
            expect.objectContaining({ preference_order: 1 }),
            expect.objectContaining({ preference_order: 2 }),
          ],
        },
      }),
    });
    expect(historyDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        visit_request_id: VISIT_ID,
        communication_type: 'REFERRAL',
        message: `Created by curator referral from inquiry ${INQUIRY_ID}.`,
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: CURATOR_ID,
        action: 'CREATE_VISIT_REQUEST_FROM_REFERRAL',
      }),
    });
  });

  it('adds an internal note and lists the timeline', async () => {
    visitDelegate.findUnique.mockResolvedValue(visitRecord());
    historyDelegate.findMany.mockResolvedValue([]);

    await expect(
      service.addNote(
        VISIT_ID,
        { message: 'Class size is now 25.' },
        CURATOR_ID,
      ),
    ).resolves.toMatchObject({
      type: 'NOTE',
      message: 'Class size is now 25.',
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ADD_VISIT_REQUEST_NOTE',
        details: { entryId: ENTRY_ID },
      }),
    });

    await service.listHistory(VISIT_ID);
    expect(historyDelegate.findMany).toHaveBeenCalledWith({
      where: { visit_request_id: VISIT_ID },
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
    });
  });

  it('returns 404 for an unknown visit request', async () => {
    visitDelegate.findUnique.mockResolvedValue(null);

    await expect(service.findOne(VISIT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
