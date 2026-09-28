import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVisitRequestDto } from './dto/create-visit-request.dto';
import { VisitRequestStatus } from './entities/visit-request.entity';
import { VisitRequestsService } from './visit-requests.service';

const VISIT_ID = '11111111-1111-4111-8111-111111111111';
const CURATOR_ID = '22222222-2222-4222-8222-222222222222';
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
    delete: jest.fn(),
  };
  const childDelegate = () => ({ deleteMany: jest.fn() });
  const auditDelegate = { create: jest.fn() };
  const prisma = {
    visit_request: visitDelegate,
    visit_request_vehicle: childDelegate(),
    visit_request_visitor: childDelegate(),
    preferred_visit_date: childDelegate(),
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

  it('changes status and audits the transition', async () => {
    visitDelegate.findUnique.mockResolvedValue(visitRecord());
    visitDelegate.update.mockResolvedValue(
      visitRecord({ status: 'APPROVED_BY_CURATOR', reviewed_by: CURATOR_ID }),
    );

    const result = await service.update(
      VISIT_ID,
      { status: VisitRequestStatus.APPROVED_BY_CURATOR },
      CURATOR_ID,
    );

    expect(result.status).toBe(VisitRequestStatus.APPROVED_BY_CURATOR);
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: CURATOR_ID,
        action: 'UPDATE_VISIT_REQUEST_STATUS',
        details: { previousStatus: 'PENDING', status: 'APPROVED_BY_CURATOR' },
      }),
    });
  });

  it('removes child rows before deleting the request', async () => {
    visitDelegate.findUnique.mockResolvedValue(visitRecord());

    await service.remove(VISIT_ID, CURATOR_ID);

    expect(prisma.preferred_visit_date.deleteMany).toHaveBeenCalledWith({
      where: { visit_id: VISIT_ID },
    });
    expect(visitDelegate.delete).toHaveBeenCalledWith({
      where: { id: VISIT_ID },
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'DELETE_VISIT_REQUEST' }),
    });
  });

  it('returns 404 for an unknown visit request', async () => {
    visitDelegate.findUnique.mockResolvedValue(null);

    await expect(service.findOne(VISIT_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
