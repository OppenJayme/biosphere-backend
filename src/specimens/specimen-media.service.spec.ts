/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../supabase/storage.service';
import { SpecimenMediaService } from './specimen-media.service';

const specimenDelegate = { findUnique: jest.fn(), update: jest.fn() };
const mediaDelegate = {
  aggregate: jest.fn(),
  create: jest.fn(),
  delete: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
};
const revisionDelegate = { create: jest.fn() };
const auditDelegate = { create: jest.fn() };
const transactionMock = jest.fn();
const storageMock = {
  upload: jest.fn(),
  remove: jest.fn(),
  createSignedUrl: jest.fn(),
};

const prismaMock = {
  specimen: specimenDelegate,
  specimen_media: mediaDelegate,
  specimen_revision_history: revisionDelegate,
  audit_log: auditDelegate,
  $transaction: transactionMock,
};

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const SPECIMEN_ID = '22222222-2222-4222-8222-222222222222';
const MEDIA_ID = '33333333-3333-4333-8333-333333333333';
const SECOND_MEDIA_ID = '44444444-4444-4444-8444-444444444444';
const TEST_DATE = new Date('2026-01-01T00:00:00.000Z');
const OLD_PATH = `${SPECIMEN_ID}/old.jpg`;
const NEW_PATH = `${SPECIMEN_ID}/new.jpg`;

function specimenRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: SPECIMEN_ID,
    status: 'UNCATALOGED',
    archived_at: null,
    ...overrides,
  };
}

function mediaRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: MEDIA_ID,
    specimen_id: SPECIMEN_ID,
    storage_path: OLD_PATH,
    display_order: 0,
    caption: 'Dorsal view',
    is_cover: true,
    created_at: TEST_DATE,
    ...overrides,
  };
}

function imageFile(): Express.Multer.File {
  return {
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    mimetype: 'image/jpeg',
    originalname: 'specimen.jpg',
    size: 4,
  } as Express.Multer.File;
}

describe('SpecimenMediaService', () => {
  let service: SpecimenMediaService;
  let loggerErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    loggerErrorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterAll(() => {
    loggerErrorSpy.mockRestore();
  });

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) =>
        Promise.resolve(callback(prismaMock)),
    );
    specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
    specimenDelegate.update.mockResolvedValue(specimenRecord());
    mediaDelegate.aggregate.mockResolvedValue({
      _max: { display_order: null },
    });
    mediaDelegate.create.mockResolvedValue(mediaRecord());
    mediaDelegate.findFirst.mockResolvedValue(mediaRecord());
    mediaDelegate.findMany.mockResolvedValue([mediaRecord()]);
    mediaDelegate.update.mockResolvedValue(mediaRecord());
    mediaDelegate.updateMany.mockResolvedValue({ count: 1 });
    mediaDelegate.delete.mockResolvedValue(mediaRecord());
    revisionDelegate.create.mockResolvedValue({});
    auditDelegate.create.mockResolvedValue({});
    storageMock.upload.mockResolvedValue(NEW_PATH);
    storageMock.remove.mockResolvedValue(undefined);
    storageMock.createSignedUrl.mockResolvedValue('https://signed.example');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpecimenMediaService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: StorageService, useValue: storageMock },
      ],
    }).compile();
    service = module.get(SpecimenMediaService);
  });

  it('uploads the first image as cover and records attribution atomically', async () => {
    mediaDelegate.findFirst.mockResolvedValueOnce(null);
    mediaDelegate.create.mockResolvedValueOnce(
      mediaRecord({ storage_path: NEW_PATH }),
    );

    const result = await service.create(
      SPECIMEN_ID,
      imageFile(),
      { caption: 'Dorsal view' },
      ACCOUNT_ID,
    );

    expect(storageMock.upload).toHaveBeenCalledWith(
      'specimen-media',
      SPECIMEN_ID,
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(mediaDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        specimen_id: SPECIMEN_ID,
        storage_path: NEW_PATH,
        display_order: 0,
        caption: 'Dorsal view',
        is_cover: true,
      }),
    });
    expect(specimenDelegate.update).toHaveBeenCalledWith({
      where: { id: SPECIMEN_ID },
      data: { updated_by: ACCOUNT_ID, updated_at: expect.any(Date) },
    });
    expect(revisionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        specimen_id: SPECIMEN_ID,
        changed_by: ACCOUNT_ID,
        field_changed: 'specimen_media',
        new_value: MEDIA_ID,
        source_section: 'specimen_media',
      }),
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: ACCOUNT_ID,
        action: 'CREATE_SPECIMEN_MEDIA',
      }),
    });
    expect(result.storagePath).toBe(NEW_PATH);
    expect(result.isCover).toBe(true);
  });

  it('appends display order and honors explicit cover selection', async () => {
    mediaDelegate.aggregate.mockResolvedValueOnce({
      _max: { display_order: 6 },
    });
    mediaDelegate.create.mockResolvedValueOnce(
      mediaRecord({ storage_path: NEW_PATH, display_order: 7 }),
    );

    await service.create(
      SPECIMEN_ID,
      imageFile(),
      { isCover: true },
      ACCOUNT_ID,
    );

    expect(mediaDelegate.updateMany).toHaveBeenCalledWith({
      where: { specimen_id: SPECIMEN_ID, is_cover: true },
      data: { is_cover: false },
    });
    expect(mediaDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ display_order: 7, is_cover: true }),
    });
  });

  it('rejects missing files and archived specimens before uploading', async () => {
    await expect(
      service.create(SPECIMEN_ID, undefined, {}, ACCOUNT_ID),
    ).rejects.toThrow(BadRequestException);

    specimenDelegate.findUnique.mockResolvedValueOnce(
      specimenRecord({ status: 'ARCHIVED', archived_at: TEST_DATE }),
    );
    await expect(
      service.create(SPECIMEN_ID, imageFile(), {}, ACCOUNT_ID),
    ).rejects.toThrow(BadRequestException);
    expect(storageMock.upload).not.toHaveBeenCalled();
  });

  it('removes a newly uploaded object when database creation fails', async () => {
    mediaDelegate.create.mockRejectedValueOnce(new Error('database failed'));

    await expect(
      service.create(SPECIMEN_ID, imageFile(), {}, ACCOUNT_ID),
    ).rejects.toThrow(InternalServerErrorException);
    expect(storageMock.remove).toHaveBeenCalledWith('specimen-media', NEW_PATH);
  });

  it('cleans up an upload when automatic display order overflows', async () => {
    mediaDelegate.aggregate.mockResolvedValueOnce({
      _max: { display_order: 2_147_483_647 },
    });

    await expect(
      service.create(SPECIMEN_ID, imageFile(), {}, ACCOUNT_ID),
    ).rejects.toThrow(BadRequestException);
    expect(storageMock.remove).toHaveBeenCalledWith('specimen-media', NEW_PATH);
    expect(mediaDelegate.create).not.toHaveBeenCalled();
  });

  it('lists media in stable display order and retrieves only scoped media', async () => {
    await expect(service.findAll(SPECIMEN_ID)).resolves.toEqual([
      expect.objectContaining({ id: MEDIA_ID }),
    ]);
    expect(mediaDelegate.findMany).toHaveBeenCalledWith({
      where: { specimen_id: SPECIMEN_ID },
      orderBy: [{ display_order: 'asc' }, { created_at: 'asc' }, { id: 'asc' }],
    });

    mediaDelegate.findFirst.mockResolvedValueOnce(null);
    await expect(service.findOne(SPECIMEN_ID, MEDIA_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('creates a short-lived URL only from the stored media path', async () => {
    await expect(
      service.createSignedUrl(SPECIMEN_ID, MEDIA_ID),
    ).resolves.toEqual({
      mediaId: MEDIA_ID,
      signedUrl: 'https://signed.example',
      expiresIn: 300,
    });
    expect(storageMock.createSignedUrl).toHaveBeenCalledWith(
      'specimen-media',
      OLD_PATH,
      300,
    );
  });

  it('updates only changed metadata with revision and audit history', async () => {
    mediaDelegate.update.mockResolvedValueOnce(
      mediaRecord({ caption: null, display_order: 3 }),
    );

    const result = await service.update(
      SPECIMEN_ID,
      MEDIA_ID,
      { caption: null, displayOrder: 3 },
      ACCOUNT_ID,
    );

    expect(mediaDelegate.update).toHaveBeenCalledWith({
      where: { id: MEDIA_ID },
      data: { caption: null, display_order: 3 },
    });
    expect(revisionDelegate.create).toHaveBeenCalledTimes(2);
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'UPDATE_SPECIMEN_MEDIA' }),
    });
    expect(result.caption).toBeNull();
  });

  it('rejects empty or unchanged metadata updates', async () => {
    await expect(
      service.update(SPECIMEN_ID, MEDIA_ID, {}, ACCOUNT_ID),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.update(
        SPECIMEN_ID,
        MEDIA_ID,
        { caption: 'Dorsal view', displayOrder: 0 },
        ACCOUNT_ID,
      ),
    ).rejects.toThrow(BadRequestException);
    expect(mediaDelegate.update).not.toHaveBeenCalled();
  });

  it('sets exactly one cover and records the previous cover', async () => {
    const selected = mediaRecord({ id: SECOND_MEDIA_ID, is_cover: false });
    mediaDelegate.findFirst
      .mockResolvedValueOnce(selected)
      .mockResolvedValueOnce({ id: MEDIA_ID });
    mediaDelegate.update.mockResolvedValueOnce({
      ...selected,
      is_cover: true,
    });

    const result = await service.setCover(
      SPECIMEN_ID,
      SECOND_MEDIA_ID,
      ACCOUNT_ID,
    );

    expect(mediaDelegate.updateMany).toHaveBeenCalledWith({
      where: { specimen_id: SPECIMEN_ID, is_cover: true },
      data: { is_cover: false },
    });
    expect(mediaDelegate.update).toHaveBeenCalledWith({
      where: { id: SECOND_MEDIA_ID },
      data: { is_cover: true },
    });
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        details: expect.objectContaining({ previousCoverId: MEDIA_ID }),
      }),
    });
    expect(result.isCover).toBe(true);
  });

  it('treats selecting the existing cover as idempotent', async () => {
    await expect(
      service.setCover(SPECIMEN_ID, MEDIA_ID, ACCOUNT_ID),
    ).resolves.toEqual(
      expect.objectContaining({ id: MEDIA_ID, isCover: true }),
    );
    expect(mediaDelegate.updateMany).not.toHaveBeenCalled();
    expect(mediaDelegate.update).not.toHaveBeenCalled();
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('replaces an image, keeps metadata, and cleans up the previous object', async () => {
    mediaDelegate.update.mockResolvedValueOnce(
      mediaRecord({ storage_path: NEW_PATH }),
    );

    const result = await service.replaceFile(
      SPECIMEN_ID,
      MEDIA_ID,
      imageFile(),
      ACCOUNT_ID,
    );

    expect(mediaDelegate.update).toHaveBeenCalledWith({
      where: { id: MEDIA_ID },
      data: { storage_path: NEW_PATH },
    });
    expect(storageMock.remove).toHaveBeenCalledWith('specimen-media', OLD_PATH);
    expect(revisionDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        field_changed: 'specimen_media.file',
        old_value: OLD_PATH,
        new_value: NEW_PATH,
      }),
    });
    expect(result.media.storagePath).toBe(NEW_PATH);
    expect(result.previousStorageCleanupPending).toBe(false);
  });

  it('removes the replacement upload when its database update fails', async () => {
    mediaDelegate.update.mockRejectedValueOnce(new Error('database failed'));

    await expect(
      service.replaceFile(SPECIMEN_ID, MEDIA_ID, imageFile(), ACCOUNT_ID),
    ).rejects.toThrow(InternalServerErrorException);
    expect(storageMock.remove).toHaveBeenCalledTimes(1);
    expect(storageMock.remove).toHaveBeenCalledWith('specimen-media', NEW_PATH);
  });

  it('reports pending cleanup when a replaced object cannot be removed', async () => {
    mediaDelegate.update.mockResolvedValueOnce(
      mediaRecord({ storage_path: NEW_PATH }),
    );
    storageMock.remove.mockRejectedValueOnce(new Error('storage unavailable'));

    const result = await service.replaceFile(
      SPECIMEN_ID,
      MEDIA_ID,
      imageFile(),
      ACCOUNT_ID,
    );

    expect(result.previousStorageCleanupPending).toBe(true);
    expect(auditDelegate.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        action: 'CLEANUP_REPLACED_SPECIMEN_MEDIA',
        status: 'FAILED',
      }),
    });
  });

  it('removes a cover, promotes the next image, and cleans private storage', async () => {
    const next = mediaRecord({
      id: SECOND_MEDIA_ID,
      storage_path: NEW_PATH,
      display_order: 1,
      is_cover: false,
    });
    mediaDelegate.findFirst
      .mockResolvedValueOnce(mediaRecord())
      .mockResolvedValueOnce(next);

    const result = await service.remove(SPECIMEN_ID, MEDIA_ID, ACCOUNT_ID);

    expect(mediaDelegate.delete).toHaveBeenCalledWith({
      where: { id: MEDIA_ID },
    });
    expect(mediaDelegate.update).toHaveBeenCalledWith({
      where: { id: SECOND_MEDIA_ID },
      data: { is_cover: true },
    });
    expect(storageMock.remove).toHaveBeenCalledWith('specimen-media', OLD_PATH);
    expect(result).toEqual({
      id: MEDIA_ID,
      removed: true,
      storageCleanupPending: false,
    });
  });

  it('reports pending storage cleanup without undoing safe metadata removal', async () => {
    mediaDelegate.findFirst
      .mockResolvedValueOnce(mediaRecord({ is_cover: false }))
      .mockResolvedValueOnce(mediaRecord({ is_cover: false }));
    storageMock.remove.mockRejectedValueOnce(new Error('storage unavailable'));

    const result = await service.remove(SPECIMEN_ID, MEDIA_ID, ACCOUNT_ID);

    expect(mediaDelegate.delete).toHaveBeenCalled();
    expect(result.storageCleanupPending).toBe(true);
    expect(auditDelegate.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        action: 'CLEANUP_REMOVED_SPECIMEN_MEDIA',
        status: 'FAILED',
      }),
    });
  });

  it('does not remove the private object when database removal fails', async () => {
    mediaDelegate.delete.mockRejectedValueOnce(new Error('database failed'));

    await expect(
      service.remove(SPECIMEN_ID, MEDIA_ID, ACCOUNT_ID),
    ).rejects.toThrow('database failed');
    expect(storageMock.remove).not.toHaveBeenCalled();
  });

  it('retries a serializable conflict and succeeds without storage work', async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError(
      'Write conflict',
      { code: 'P2034', clientVersion: '7.10.0' },
    );
    transactionMock
      .mockRejectedValueOnce(conflict)
      .mockImplementationOnce(
        (callback: (transaction: typeof prismaMock) => unknown) =>
          Promise.resolve(callback(prismaMock)),
      );
    const selected = mediaRecord({ id: SECOND_MEDIA_ID, is_cover: false });
    mediaDelegate.findFirst
      .mockResolvedValueOnce(selected)
      .mockResolvedValueOnce({ id: MEDIA_ID });
    mediaDelegate.update.mockResolvedValueOnce({ ...selected, is_cover: true });

    await expect(
      service.setCover(SPECIMEN_ID, SECOND_MEDIA_ID, ACCOUNT_ID),
    ).resolves.toEqual(
      expect.objectContaining({ id: SECOND_MEDIA_ID, isCover: true }),
    );
    expect(transactionMock).toHaveBeenCalledTimes(2);
    expect(storageMock.upload).not.toHaveBeenCalled();
    expect(storageMock.remove).not.toHaveBeenCalled();
  });

  it('retries serializable cover conflicts and stops after three failures', async () => {
    transactionMock.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Write conflict', {
        code: 'P2034',
        clientVersion: '7.10.0',
      }),
    );

    await expect(
      service.setCover(SPECIMEN_ID, MEDIA_ID, ACCOUNT_ID),
    ).rejects.toThrow(ConflictException);
    expect(transactionMock).toHaveBeenCalledTimes(3);
  });
});
