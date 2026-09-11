/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../supabase/storage.service';
import { ExhibitStatus } from './entities/exhibit.entity';
import { ExhibitsService } from './exhibits.service';

const specimenDelegate = { findUnique: jest.fn() };
const exhibitDelegate = {
  findUnique: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
};
const exhibitMediaDelegate = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  create: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
};
const auditDelegate = { create: jest.fn() };
const transactionMock = jest.fn();

const prismaMock = {
  specimen: specimenDelegate,
  exhibit: exhibitDelegate,
  exhibit_media: exhibitMediaDelegate,
  audit_log: auditDelegate,
  $transaction: transactionMock,
};

const storageServiceMock = {
  upload: jest.fn(),
  remove: jest.fn(),
};

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const SPECIMEN_ID = '33333333-3333-4333-8333-333333333333';
const EXHIBIT_ID = '44444444-4444-4444-8444-444444444444';
const TEST_DATE = new Date('2026-01-01T00:00:00.000Z');

function specimenRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: SPECIMEN_ID,
    status: 'CATALOGED',
    public_display_allowed: true,
    archived_at: null,
    ...overrides,
  };
}

function exhibitRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: EXHIBIT_ID,
    specimen_id: SPECIMEN_ID,
    created_by: ACCOUNT_ID,
    public_slug: 'six-legged-carabao',
    interesting_facts: null,
    public_description: null,
    distribution: null,
    diet: null,
    layout_type: null,
    status: 'UNPUBLISHED',
    published_at: null,
    archived_at: null,
    created_at: TEST_DATE,
    updated_at: TEST_DATE,
    ...overrides,
  };
}

describe('ExhibitsService', () => {
  let service: ExhibitsService;

  beforeEach(async () => {
    jest.resetAllMocks();
    transactionMock.mockImplementation(
      (callback: (transaction: typeof prismaMock) => unknown) =>
        Promise.resolve(callback(prismaMock)),
    );
    auditDelegate.create.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExhibitsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: StorageService, useValue: storageServiceMock },
      ],
    }).compile();

    service = module.get<ExhibitsService>(ExhibitsService);
  });

  describe('create', () => {
    const dto = { specimenId: SPECIMEN_ID, publicSlug: 'six-legged-carabao' };

    it('creates an exhibit for an eligible, unpublished specimen', async () => {
      specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
      exhibitDelegate.findFirst.mockResolvedValue(null);
      exhibitDelegate.findUnique.mockResolvedValue(null);
      exhibitDelegate.create.mockResolvedValue(exhibitRecord());

      const result = await service.create(dto, ACCOUNT_ID);

      expect(exhibitDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          specimen_id: SPECIMEN_ID,
          created_by: ACCOUNT_ID,
          public_slug: 'six-legged-carabao',
          status: 'UNPUBLISHED',
        }),
      });
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'CREATE_EXHIBIT' }),
      });
      expect(result.status).toBe(ExhibitStatus.UNPUBLISHED);
    });

    it('rejects a specimen that is not Cataloged and public-display approved', async () => {
      specimenDelegate.findUnique.mockResolvedValue(
        specimenRecord({ status: 'UNCATALOGED' }),
      );

      await expect(service.create(dto, ACCOUNT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(exhibitDelegate.create).not.toHaveBeenCalled();
    });

    it('rejects a missing specimen', async () => {
      specimenDelegate.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, ACCOUNT_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects a specimen that already has an active exhibit', async () => {
      specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
      exhibitDelegate.findFirst.mockResolvedValue({ id: 'other-exhibit' });

      await expect(service.create(dto, ACCOUNT_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(exhibitDelegate.create).not.toHaveBeenCalled();
    });

    it('rejects a slug that is already taken', async () => {
      specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
      exhibitDelegate.findFirst.mockResolvedValue(null);
      exhibitDelegate.findUnique.mockResolvedValue({ id: 'other-exhibit' });

      await expect(service.create(dto, ACCOUNT_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(exhibitDelegate.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates changed fields', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      exhibitDelegate.update.mockResolvedValue(
        exhibitRecord({ public_description: 'Updated' }),
      );

      const result = await service.update(
        EXHIBIT_ID,
        { publicDescription: 'Updated' },
        ACCOUNT_ID,
      );

      expect(result.publicDescription).toBe('Updated');
    });

    it('rejects an update with no changed fields', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());

      await expect(
        service.update(EXHIBIT_ID, {}, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects changes to an archived exhibit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ archived_at: TEST_DATE }),
      );

      await expect(
        service.update(EXHIBIT_ID, { diet: 'Insects' }, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('publish / disable / archive', () => {
    it('publishes an eligible unpublished exhibit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
      exhibitDelegate.update.mockResolvedValue(
        exhibitRecord({ status: 'PUBLISHED', published_at: TEST_DATE }),
      );

      const result = await service.publish(EXHIBIT_ID, ACCOUNT_ID);

      expect(exhibitDelegate.update).toHaveBeenCalledWith({
        where: { id: EXHIBIT_ID },
        data: expect.objectContaining({ status: 'PUBLISHED' }),
      });
      expect(result.status).toBe(ExhibitStatus.PUBLISHED);
    });

    it('blocks publishing when the specimen is no longer eligible', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      specimenDelegate.findUnique.mockResolvedValue(
        specimenRecord({ public_display_allowed: false }),
      );

      await expect(
        service.publish(EXHIBIT_ID, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(exhibitDelegate.update).not.toHaveBeenCalled();
    });

    it('disables a published exhibit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ status: 'PUBLISHED' }),
      );
      exhibitDelegate.update.mockResolvedValue(
        exhibitRecord({ status: 'DISABLED' }),
      );

      const result = await service.disable(EXHIBIT_ID, ACCOUNT_ID);

      expect(result.status).toBe(ExhibitStatus.DISABLED);
    });

    it('archives an exhibit and treats repeated archive calls as idempotent', async () => {
      exhibitDelegate.findUnique.mockResolvedValueOnce(
        exhibitRecord({ status: 'PUBLISHED' }),
      );
      exhibitDelegate.update.mockResolvedValue(
        exhibitRecord({ status: 'DISABLED', archived_at: TEST_DATE }),
      );

      const archived = await service.archive(EXHIBIT_ID, ACCOUNT_ID);
      expect(archived.archivedAt).toEqual(TEST_DATE);

      exhibitDelegate.findUnique.mockResolvedValueOnce(
        exhibitRecord({ archived_at: TEST_DATE }),
      );
      await expect(
        service.archive(EXHIBIT_ID, ACCOUNT_ID),
      ).resolves.toHaveProperty('archivedAt', TEST_DATE);
      expect(exhibitDelegate.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('findPublishedBySlug', () => {
    it('returns a published exhibit with media and without internal attribution', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ status: 'PUBLISHED' }),
      );
      exhibitMediaDelegate.findMany.mockResolvedValue([
        {
          id: 'media-1',
          exhibit_id: EXHIBIT_ID,
          storage_path: `${EXHIBIT_ID}/photo.jpg`,
          display_order: 0,
          caption: null,
          is_cover: true,
        },
      ]);

      const result = await service.findPublishedBySlug('six-legged-carabao');

      expect(result).not.toHaveProperty('createdBy');
      expect(result.media).toHaveLength(1);
    });

    it('rejects an unpublished slug', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ status: 'UNPUBLISHED' }),
      );

      await expect(
        service.findPublishedBySlug('six-legged-carabao'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects an archived slug even if still marked Published', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ status: 'PUBLISHED', archived_at: TEST_DATE }),
      );

      await expect(
        service.findPublishedBySlug('six-legged-carabao'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('media', () => {
    it('uploads media, resets the prior cover, and records audit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      storageServiceMock.upload.mockResolvedValue(`${EXHIBIT_ID}/cover.jpg`);
      exhibitMediaDelegate.updateMany.mockResolvedValue({ count: 1 });
      exhibitMediaDelegate.create.mockResolvedValue({
        id: 'media-2',
        exhibit_id: EXHIBIT_ID,
        storage_path: `${EXHIBIT_ID}/cover.jpg`,
        display_order: 0,
        caption: 'Cover shot',
        is_cover: true,
      });

      const file = {
        buffer: Buffer.from('fake image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      const result = await service.addMedia(
        EXHIBIT_ID,
        file,
        { caption: 'Cover shot', isCover: true },
        ACCOUNT_ID,
      );

      expect(storageServiceMock.upload).toHaveBeenCalledWith(
        'exhibit-media',
        EXHIBIT_ID,
        file.buffer,
        'image/jpeg',
      );
      expect(exhibitMediaDelegate.updateMany).toHaveBeenCalledWith({
        where: { exhibit_id: EXHIBIT_ID, is_cover: true },
        data: { is_cover: false },
      });
      expect(result.isCover).toBe(true);
    });

    it('rejects media upload for an archived exhibit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ archived_at: TEST_DATE }),
      );
      const file = {
        buffer: Buffer.from('fake image'),
        mimetype: 'image/jpeg',
      } as Express.Multer.File;

      await expect(
        service.addMedia(EXHIBIT_ID, file, {}, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storageServiceMock.upload).not.toHaveBeenCalled();
    });

    it('removes media and cleans up storage', async () => {
      exhibitMediaDelegate.findUnique.mockResolvedValue({
        id: 'media-1',
        exhibit_id: EXHIBIT_ID,
        storage_path: `${EXHIBIT_ID}/photo.jpg`,
      });
      exhibitMediaDelegate.delete.mockResolvedValue({});

      const result = await service.removeMedia(
        EXHIBIT_ID,
        'media-1',
        ACCOUNT_ID,
      );

      expect(exhibitMediaDelegate.delete).toHaveBeenCalledWith({
        where: { id: 'media-1' },
      });
      expect(storageServiceMock.remove).toHaveBeenCalledWith(
        'exhibit-media',
        `${EXHIBIT_ID}/photo.jpg`,
      );
      expect(result).toEqual({ id: 'media-1', removed: true });
    });

    it('404s when removing media that does not belong to the exhibit', async () => {
      exhibitMediaDelegate.findUnique.mockResolvedValue({
        id: 'media-1',
        exhibit_id: 'some-other-exhibit',
        storage_path: 'some-other-exhibit/photo.jpg',
      });

      await expect(
        service.removeMedia(EXHIBIT_ID, 'media-1', ACCOUNT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(exhibitMediaDelegate.delete).not.toHaveBeenCalled();
    });
  });
});
