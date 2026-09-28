import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InquiriesService } from './inquiries.service';
import { InquiryStatus } from './entities/inquiry.entity';

const INQUIRY_ID = '11111111-1111-4111-8111-111111111111';
const CURATOR_ID = '22222222-2222-4222-8222-222222222222';
const CREATED_AT = new Date('2026-09-01T00:00:00.000Z');

const inquiryRecord = (overrides: Record<string, unknown> = {}) => ({
  id: INQUIRY_ID,
  reviewed_by: null,
  full_name: 'Juan Dela Cruz',
  email_address: 'juan@example.com',
  contact_number: null,
  organization_name: null,
  inquiry_type: 'GENERAL',
  message: 'Are you open on Saturdays?',
  attachment_path: null,
  status: 'PENDING',
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  consent_accepted_at: CREATED_AT,
  ...overrides,
});

describe('InquiriesService', () => {
  const inquiryDelegate = {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const auditDelegate = { create: jest.fn() };
  const prisma = {
    inquiry: inquiryDelegate,
    audit_log: auditDelegate,
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(
    (callback: (client: unknown) => unknown) =>
      Promise.resolve(callback(prisma)),
  );
  let service: InquiriesService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InquiriesService(prisma as unknown as PrismaService);
  });

  it('stores a submission with consent and returns a receipt without personal data', async () => {
    inquiryDelegate.create.mockResolvedValue(inquiryRecord());

    const receipt = await service.create({
      name: 'Juan Dela Cruz',
      email: 'juan@example.com',
      message: 'Are you open on Saturdays?',
      consentAccepted: true,
    });

    expect(receipt).toEqual({
      id: INQUIRY_ID,
      status: InquiryStatus.PENDING,
      submittedAt: CREATED_AT,
    });
    expect(inquiryDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        full_name: 'Juan Dela Cruz',
        email_address: 'juan@example.com',
        inquiry_type: 'GENERAL',
        status: 'PENDING',
        consent_accepted_at: expect.any(Date),
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: null,
        action: 'SUBMIT_INQUIRY',
        affected_record_id: INQUIRY_ID,
        details: { inquiryType: 'GENERAL' },
      }),
    });
  });

  it('maps stored rows to the curator entity', async () => {
    inquiryDelegate.findMany.mockResolvedValue([inquiryRecord()]);

    await expect(
      service.findAll({ status: InquiryStatus.PENDING }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: INQUIRY_ID,
        name: 'Juan Dela Cruz',
        email: 'juan@example.com',
        status: InquiryStatus.PENDING,
      }),
    ]);
    expect(inquiryDelegate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: InquiryStatus.PENDING } }),
    );
  });

  it('changes status, records the reviewer, and audits the transition', async () => {
    inquiryDelegate.findUnique.mockResolvedValue(inquiryRecord());
    inquiryDelegate.update.mockResolvedValue(
      inquiryRecord({ status: 'REVIEWED', reviewed_by: CURATOR_ID }),
    );

    const result = await service.update(
      INQUIRY_ID,
      { status: InquiryStatus.REVIEWED },
      CURATOR_ID,
    );

    expect(result.status).toBe(InquiryStatus.REVIEWED);
    expect(inquiryDelegate.update).toHaveBeenCalledWith({
      where: { id: INQUIRY_ID },
      data: expect.objectContaining({
        status: 'REVIEWED',
        reviewed_by: CURATOR_ID,
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: CURATOR_ID,
        action: 'UPDATE_INQUIRY_STATUS',
        details: { previousStatus: 'PENDING', status: 'REVIEWED' },
      }),
    });
  });

  it('makes no writes when the status is unchanged', async () => {
    inquiryDelegate.findUnique.mockResolvedValue(inquiryRecord());

    await service.update(
      INQUIRY_ID,
      { status: InquiryStatus.PENDING },
      CURATOR_ID,
    );

    expect(inquiryDelegate.update).not.toHaveBeenCalled();
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown inquiry', async () => {
    inquiryDelegate.findUnique.mockResolvedValue(null);

    await expect(service.findOne(INQUIRY_ID)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('deletes and audits an inquiry', async () => {
    inquiryDelegate.findUnique.mockResolvedValue(inquiryRecord());

    await service.remove(INQUIRY_ID, CURATOR_ID);

    expect(inquiryDelegate.delete).toHaveBeenCalledWith({
      where: { id: INQUIRY_ID },
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'DELETE_INQUIRY' }),
    });
  });

  it('returns 409 when linked records block deletion', async () => {
    inquiryDelegate.findUnique.mockResolvedValue(inquiryRecord());
    inquiryDelegate.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('fk', {
        code: 'P2003',
        clientVersion: 'test',
      }),
    );

    await expect(service.remove(INQUIRY_ID, CURATOR_ID)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
