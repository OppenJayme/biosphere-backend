import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SpecimenStatus } from '../specimens/entities/specimen.entity';
import { SpecimensService } from '../specimens/specimens.service';
import { OfflineSyncService } from './offline-sync.service';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const DRAFT_ID = '22222222-2222-4222-8222-222222222222';
const SPECIMEN_ID = '33333333-3333-4333-8333-333333333333';

const receiptDelegate = {
  findUnique: jest.fn(),
  create: jest.fn(),
};
const transactionMock = jest.fn();
const prismaMock = {
  offline_draft_sync: receiptDelegate,
  $transaction: transactionMock,
};
const specimensMock = {
  createOfflineDraft: jest.fn(),
  findOneInTransaction: jest.fn(),
};

const specimen = {
  id: SPECIMEN_ID,
  collectionId: null,
  accessionNumber: null,
  specimenCategory: 'ZOOLOGY',
  scientificName: 'Testus specimenus',
  commonName: null,
  gender: null,
  classificationStatus: null,
  status: SpecimenStatus.UNCATALOGED,
  publicDisplay: false,
  remarks: null,
  createdBy: ACCOUNT_ID,
  updatedBy: ACCOUNT_ID,
  archivedBy: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const dto = {
  clientDraftId: DRAFT_ID,
  draft: { specimenCategory: 'ZOOLOGY', scientificName: 'Testus specimenus' },
};

describe('OfflineSyncService', () => {
  let service: OfflineSyncService;
  let createdReceiptFingerprint: string | undefined;

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) =>
        Promise.resolve(callback(prismaMock)),
    );
    receiptDelegate.findUnique.mockResolvedValue(null);
    receiptDelegate.create.mockImplementation(
      ({ data }: { data: { payload_fingerprint: string } }) => {
        createdReceiptFingerprint = data.payload_fingerprint;
        return {};
      },
    );
    createdReceiptFingerprint = undefined;
    specimensMock.createOfflineDraft.mockResolvedValue(specimen);
    specimensMock.findOneInTransaction.mockResolvedValue(specimen);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfflineSyncService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SpecimensService, useValue: specimensMock },
      ],
    }).compile();

    service = module.get<OfflineSyncService>(OfflineSyncService);
  });

  it('creates one Uncataloged specimen and stores a durable receipt', async () => {
    await expect(service.syncSpecimenDraft(dto, ACCOUNT_ID)).resolves.toEqual({
      clientDraftId: DRAFT_ID,
      alreadySynchronized: false,
      specimen,
    });

    expect(specimensMock.createOfflineDraft).toHaveBeenCalledWith(
      prismaMock,
      dto.draft,
      ACCOUNT_ID,
      DRAFT_ID,
    );
    expect(receiptDelegate.findUnique).toHaveBeenCalledWith({
      where: {
        created_by_client_draft_id: {
          created_by: ACCOUNT_ID,
          client_draft_id: DRAFT_ID,
        },
      },
    });
    expect(receiptDelegate.create).toHaveBeenCalledWith({
      data: {
        created_by: ACCOUNT_ID,
        client_draft_id: DRAFT_ID,
        specimen_id: SPECIMEN_ID,
        payload_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) as string,
      },
    });
    expect(transactionMock).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('returns the original specimen for a same-payload retry', async () => {
    await service.syncSpecimenDraft(dto, ACCOUNT_ID);
    expect(createdReceiptFingerprint).toMatch(/^[a-f0-9]{64}$/);
    receiptDelegate.findUnique.mockResolvedValue({
      specimen_id: SPECIMEN_ID,
      payload_fingerprint: createdReceiptFingerprint,
    });

    await expect(service.syncSpecimenDraft(dto, ACCOUNT_ID)).resolves.toEqual({
      clientDraftId: DRAFT_ID,
      alreadySynchronized: true,
      specimen,
    });
    expect(specimensMock.createOfflineDraft).toHaveBeenCalledTimes(1);
    expect(receiptDelegate.create).toHaveBeenCalledTimes(1);
    expect(specimensMock.findOneInTransaction).toHaveBeenCalledWith(
      prismaMock,
      SPECIMEN_ID,
    );
  });

  it('treats omitted and explicit-null optional values as the same draft', async () => {
    await service.syncSpecimenDraft(dto, ACCOUNT_ID);
    receiptDelegate.findUnique.mockResolvedValue({
      specimen_id: SPECIMEN_ID,
      payload_fingerprint: createdReceiptFingerprint,
    });

    await expect(
      service.syncSpecimenDraft(
        {
          clientDraftId: DRAFT_ID,
          draft: {
            collectionId: null,
            accessionNumber: null,
            specimenCategory: 'ZOOLOGY',
            scientificName: 'Testus specimenus',
            commonName: null,
            gender: null,
            classificationStatus: null,
            remarks: null,
          },
        },
        ACCOUNT_ID,
      ),
    ).resolves.toHaveProperty('alreadySynchronized', true);
    expect(specimensMock.createOfflineDraft).toHaveBeenCalledTimes(1);
  });

  it('rejects reuse of a draft ID with different content', async () => {
    receiptDelegate.findUnique.mockResolvedValue({
      specimen_id: SPECIMEN_ID,
      payload_fingerprint: '0'.repeat(64),
    });

    await expect(
      service.syncSpecimenDraft(dto, ACCOUNT_ID),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(specimensMock.createOfflineDraft).not.toHaveBeenCalled();
    expect(receiptDelegate.create).not.toHaveBeenCalled();
  });

  it.each(['P2002', 'P2034'])(
    'retries the transaction after Prisma %s contention',
    async (code) => {
      transactionMock
        .mockRejectedValueOnce(
          new Prisma.PrismaClientKnownRequestError('Contention', {
            code,
            clientVersion: '7.10.0',
          }),
        )
        .mockImplementationOnce(
          (callback: (transaction: typeof prismaMock) => unknown) =>
            Promise.resolve(callback(prismaMock)),
        );

      await expect(
        service.syncSpecimenDraft(dto, ACCOUNT_ID),
      ).resolves.toHaveProperty('alreadySynchronized', false);
      expect(transactionMock).toHaveBeenCalledTimes(2);
    },
  );

  it('returns a recoverable conflict after contention retries are exhausted', async () => {
    transactionMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Contention', {
        code: 'P2034',
        clientVersion: '7.10.0',
      }),
    );

    await expect(
      service.syncSpecimenDraft(dto, ACCOUNT_ID),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(transactionMock).toHaveBeenCalledTimes(3);
  });

  it('propagates specimen validation failures without writing a receipt', async () => {
    specimensMock.createOfflineDraft.mockRejectedValue(
      new ConflictException('Collection changed.'),
    );

    await expect(service.syncSpecimenDraft(dto, ACCOUNT_ID)).rejects.toThrow(
      'Collection changed.',
    );
    expect(receiptDelegate.create).not.toHaveBeenCalled();
  });
});
