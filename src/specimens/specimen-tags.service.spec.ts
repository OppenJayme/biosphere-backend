import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenTagsService } from './specimen-tags.service';

const specimenDelegate = { findUnique: jest.fn(), update: jest.fn() };
const tagDelegate = {
  create: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
};
const specimenTagDelegate = {
  create: jest.fn(),
  delete: jest.fn(),
  findUnique: jest.fn(),
};
const revisionDelegate = { create: jest.fn() };
const auditDelegate = { create: jest.fn() };
const transactionMock = jest.fn();
const prismaMock = {
  specimen: specimenDelegate,
  tag: tagDelegate,
  specimen_tag: specimenTagDelegate,
  specimen_revision_history: revisionDelegate,
  audit_log: auditDelegate,
  $transaction: transactionMock,
};

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPECIMEN_ID = '22222222-2222-4222-8222-222222222222';
const TAG_ID = '33333333-3333-4333-8333-333333333333';
const ATTACHMENT_ID = '44444444-4444-4444-8444-444444444444';

function specimenRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: SPECIMEN_ID,
    status: 'UNCATALOGED',
    archived_at: null,
    ...overrides,
  };
}

function tagRecord(overrides: Record<string, unknown> = {}) {
  return { id: TAG_ID, tag_name: 'Endemic', ...overrides };
}

function attachmentRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: ATTACHMENT_ID,
    specimen_id: SPECIMEN_ID,
    tag_id: TAG_ID,
    tag: tagRecord(),
    ...overrides,
  };
}

describe('SpecimenTagsService', () => {
  let service: SpecimenTagsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) =>
        Promise.resolve(callback(prismaMock)),
    );
    specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
    specimenDelegate.update.mockResolvedValue(specimenRecord());
    tagDelegate.findMany.mockResolvedValue([tagRecord()]);
    tagDelegate.findFirst.mockResolvedValue(null);
    tagDelegate.create.mockResolvedValue(tagRecord());
    specimenTagDelegate.findUnique.mockResolvedValue(null);
    specimenTagDelegate.create.mockResolvedValue(attachmentRecord());
    specimenTagDelegate.delete.mockResolvedValue(attachmentRecord());
    revisionDelegate.create.mockResolvedValue({});
    auditDelegate.create.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimenTagsService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = module.get(SpecimenTagsService);
  });

  it('searches reusable tags case-insensitively with a bounded result', async () => {
    await expect(
      service.findAvailable({ search: 'end', limit: 10 }),
    ).resolves.toEqual([{ id: TAG_ID, name: 'Endemic' }]);
    expect(tagDelegate.findMany).toHaveBeenCalledWith({
      where: {
        tag_name: {
          contains: 'end',
          mode: Prisma.QueryMode.insensitive,
        },
      },
      orderBy: [{ tag_name: 'asc' }, { id: 'asc' }],
      take: 10,
    });
  });

  it('lists only tags attached to the requested specimen', async () => {
    await expect(service.findForSpecimen(SPECIMEN_ID)).resolves.toEqual([
      { id: TAG_ID, name: 'Endemic' },
    ]);
    expect(tagDelegate.findMany).toHaveBeenCalledWith({
      where: { specimen_tag: { some: { specimen_id: SPECIMEN_ID } } },
      orderBy: [{ tag_name: 'asc' }, { id: 'asc' }],
    });
  });

  it('creates and attaches a new tag with attribution and history atomically', async () => {
    const result = await service.attach(
      SPECIMEN_ID,
      { tagName: 'Endemic' },
      ACCOUNT_ID,
    );

    expect(tagDelegate.create).toHaveBeenCalledWith({
      data: { tag_name: 'Endemic' },
    });
    expect(specimenTagDelegate.create).toHaveBeenCalledWith({
      data: { specimen_id: SPECIMEN_ID, tag_id: TAG_ID },
    });
    expect(specimenDelegate.update).toHaveBeenCalledWith({
      where: { id: SPECIMEN_ID },
      data: { updated_by: ACCOUNT_ID, updated_at: expect.any(Date) },
    });
    expect(revisionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        changed_by: ACCOUNT_ID,
        field_changed: 'specimen_tags',
        new_value: 'Endemic',
        source_section: 'specimen_tags',
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ATTACH_SPECIMEN_TAG',
        details: expect.objectContaining({ createdVocabulary: true }),
      }),
    });
    expect(result).toEqual({
      tag: { id: TAG_ID, name: 'Endemic' },
      attached: true,
    });
  });

  it('reuses the first case-insensitive tag spelling', async () => {
    tagDelegate.findFirst.mockResolvedValueOnce(tagRecord());

    const result = await service.attach(
      SPECIMEN_ID,
      { tagName: 'endemic' },
      ACCOUNT_ID,
    );

    expect(tagDelegate.findFirst).toHaveBeenCalledWith({
      where: {
        tag_name: {
          equals: 'endemic',
          mode: Prisma.QueryMode.insensitive,
        },
      },
      orderBy: { id: 'asc' },
    });
    expect(tagDelegate.create).not.toHaveBeenCalled();
    expect(result.tag.name).toBe('Endemic');
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        details: expect.objectContaining({ createdVocabulary: false }),
      }),
    });
  });

  it('handles a duplicate attachment idempotently without duplicate history', async () => {
    tagDelegate.findFirst.mockResolvedValueOnce(tagRecord());
    specimenTagDelegate.findUnique.mockResolvedValueOnce(attachmentRecord());

    await expect(
      service.attach(SPECIMEN_ID, { tagName: 'Endemic' }, ACCOUNT_ID),
    ).resolves.toEqual({
      tag: { id: TAG_ID, name: 'Endemic' },
      attached: false,
    });
    expect(specimenTagDelegate.create).not.toHaveBeenCalled();
    expect(specimenDelegate.update).not.toHaveBeenCalled();
    expect(revisionDelegate.create).not.toHaveBeenCalled();
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('allows archived tag reads but rejects archived mutations', async () => {
    specimenDelegate.findUnique.mockResolvedValue(
      specimenRecord({ status: 'ARCHIVED', archived_at: new Date() }),
    );

    await expect(service.findForSpecimen(SPECIMEN_ID)).resolves.toHaveLength(1);
    await expect(
      service.attach(SPECIMEN_ID, { tagName: 'Endemic' }, ACCOUNT_ID),
    ).rejects.toThrow(BadRequestException);
    expect(tagDelegate.create).not.toHaveBeenCalled();
  });

  it('detaches only the scoped relationship and keeps shared vocabulary', async () => {
    specimenTagDelegate.findUnique.mockResolvedValueOnce(attachmentRecord());

    await expect(
      service.detach(SPECIMEN_ID, TAG_ID, ACCOUNT_ID),
    ).resolves.toEqual({ tagId: TAG_ID, detached: true });
    expect(specimenTagDelegate.delete).toHaveBeenCalledWith({
      where: { id: ATTACHMENT_ID },
    });
    expect(revisionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        old_value: 'Endemic',
        new_value: null,
      }),
    });
    expect(tagDelegate).not.toHaveProperty('delete');
  });

  it('rejects a tag that is not attached to the requested specimen', async () => {
    await expect(
      service.detach(SPECIMEN_ID, TAG_ID, ACCOUNT_ID),
    ).rejects.toThrow(NotFoundException);
    expect(specimenTagDelegate.delete).not.toHaveBeenCalled();
  });

  it('reuses a tag created by another request after a uniqueness race', async () => {
    const uniquenessRace = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint conflict',
      { code: 'P2002', clientVersion: '7.10.0' },
    );
    tagDelegate.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(tagRecord());
    tagDelegate.create.mockRejectedValueOnce(uniquenessRace);

    await expect(
      service.attach(SPECIMEN_ID, { tagName: 'Endemic' }, ACCOUNT_ID),
    ).resolves.toEqual(expect.objectContaining({ attached: true }));
    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(tagDelegate.create).toHaveBeenCalledTimes(1);
    expect(specimenTagDelegate.create).toHaveBeenCalledTimes(1);
  });

  it('returns the winning attachment idempotently after a relationship race', async () => {
    const uniquenessRace = new Prisma.PrismaClientKnownRequestError(
      'Unique constraint conflict',
      { code: 'P2002', clientVersion: '7.10.0' },
    );
    tagDelegate.findFirst.mockResolvedValue(tagRecord());
    specimenTagDelegate.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(attachmentRecord());
    specimenTagDelegate.create.mockRejectedValueOnce(uniquenessRace);

    await expect(
      service.attach(SPECIMEN_ID, { tagName: 'Endemic' }, ACCOUNT_ID),
    ).resolves.toEqual({
      tag: { id: TAG_ID, name: 'Endemic' },
      attached: false,
    });
    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(specimenDelegate.update).not.toHaveBeenCalled();
    expect(revisionDelegate.create).not.toHaveBeenCalled();
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('returns a recoverable conflict after repeated concurrent changes', async () => {
    transactionMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Write conflict', {
        code: 'P2034',
        clientVersion: '7.10.0',
      }),
    );

    await expect(
      service.attach(SPECIMEN_ID, { tagName: 'Endemic' }, ACCOUNT_ID),
    ).rejects.toThrow(ConflictException);
    expect(transactionMock).toHaveBeenCalledTimes(3);
  });
});
