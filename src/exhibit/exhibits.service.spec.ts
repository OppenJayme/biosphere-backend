import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../supabase/storage.service';
import { ExhibitStatus } from './entities/exhibit.entity';
import { PUBLIC_SPECIMEN_FIELDS } from './exhibit-public-fields';
import { ExhibitQrService } from './exhibit-qr.service';
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
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
};
const auditDelegate = { create: jest.fn(), findFirst: jest.fn() };
const arAssetDelegate = { updateMany: jest.fn() };
const transactionMock = jest.fn();

const prismaMock = {
  specimen: specimenDelegate,
  exhibit: exhibitDelegate,
  exhibit_media: exhibitMediaDelegate,
  ar_asset: arAssetDelegate,
  audit_log: auditDelegate,
  $transaction: transactionMock,
};

const storageServiceMock = {
  upload: jest.fn(),
  remove: jest.fn(),
  createSignedUrl: jest.fn(),
};

const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';
const SPECIMEN_ID = '33333333-3333-4333-8333-333333333333';
const EXHIBIT_ID = '44444444-4444-4444-8444-444444444444';
const MEDIA_ID = '55555555-5555-4555-8555-555555555555';
const TEST_DATE = new Date('2026-01-01T00:00:00.000Z');
const SITE = 'https://museum.example';

function specimenRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: SPECIMEN_ID,
    status: 'CATALOGED',
    public_display_allowed: true,
    archived_at: null,
    ...overrides,
  };
}

// Shape returned with the curator include (specimen summary + AR assets).
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
    public_specimen_fields: [...PUBLIC_SPECIMEN_FIELDS],
    status: 'UNPUBLISHED',
    published_at: null,
    archived_at: null,
    created_at: TEST_DATE,
    updated_at: TEST_DATE,
    specimen: {
      common_name: 'Six-legged Carabao',
      scientific_name: 'Bubalus bubalis',
      accession_number: 'USCBM-MAM-001',
    },
    ar_asset: [],
    ...overrides,
  };
}

// Exhibit content required before publishing.
const FILLED_CONTENT = {
  public_description: 'A rare specimen.',
  interesting_facts: 'It has six legs.',
  distribution: 'Philippines',
  diet: 'Grass',
};

// Shape returned with the public include.
function publicRecord(overrides: Record<string, unknown> = {}) {
  return {
    ...exhibitRecord({ status: 'PUBLISHED' }),
    public_description: 'A rare specimen.',
    specimen: {
      id: SPECIMEN_ID,
      status: 'CATALOGED',
      archived_at: null,
      public_display_allowed: true,
      common_name: 'Six-legged Carabao',
      scientific_name: 'Bubalus bubalis',
      collection: { collection_name: 'Mammals' },
      specimen_taxonomy: {
        kingdom: 'Animalia',
        phylum: 'Chordata',
        class: 'Mammalia',
        order_name: 'Artiodactyla',
        family: 'Bovidae',
        genus: 'Bubalus',
        species: 'bubalis',
        habitat: 'Wetlands',
        ecological_role: 'Grazer',
        conservation_status: 'Domesticated',
      },
    },
    ar_asset: [],
    exhibit_media: [
      {
        id: MEDIA_ID,
        exhibit_id: EXHIBIT_ID,
        storage_path: `${EXHIBIT_ID}/cover.jpg`,
        display_order: 0,
        caption: 'Front view',
        is_cover: true,
      },
    ],
    ...overrides,
  };
}

function mediaRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: MEDIA_ID,
    exhibit_id: EXHIBIT_ID,
    storage_path: `${EXHIBIT_ID}/photo.jpg`,
    display_order: 0,
    caption: null,
    is_cover: false,
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
    storageServiceMock.createSignedUrl.mockImplementation(
      (bucket: string, path: string) =>
        Promise.resolve(`https://signed.example/${bucket}/${path}`),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExhibitsService,
        ExhibitQrService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: StorageService, useValue: storageServiceMock },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'PUBLIC_SITE_URL' ? `${SITE}/` : undefined,
          },
        },
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

      expect(exhibitDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            specimen_id: SPECIMEN_ID,
            created_by: ACCOUNT_ID,
            public_slug: 'six-legged-carabao',
            status: 'UNPUBLISHED',
          }),
        }),
      );
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'CREATE_EXHIBIT' }),
      });
      expect(result).toMatchObject({
        status: ExhibitStatus.UNPUBLISHED,
        publicUrl: `${SITE}/exhibits/six-legged-carabao`,
        arEnabled: false,
        specimen: { commonName: 'Six-legged Carabao' },
      });
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
      exhibitDelegate.findFirst.mockResolvedValue({ id: 'other' });

      await expect(service.create(dto, ACCOUNT_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('rejects a slug that is already taken', async () => {
      specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
      exhibitDelegate.findFirst.mockResolvedValue(null);
      exhibitDelegate.findUnique.mockResolvedValue({ id: 'other' });

      await expect(service.create(dto, ACCOUNT_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('filters by status, enabled AR, and a search across names and slug', async () => {
      exhibitDelegate.findMany.mockResolvedValue([
        exhibitRecord({
          ar_asset: [
            { id: 'a1', is_enabled: true },
            { id: 'a2', is_enabled: false },
          ],
        }),
      ]);

      const result = await service.findAll({
        status: ExhibitStatus.PUBLISHED,
        arEnabled: true,
        search: 'carabao',
      });

      const search = { contains: 'carabao', mode: 'insensitive' };
      expect(exhibitDelegate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            archived_at: null,
            status: 'PUBLISHED',
            ar_asset: { some: { is_enabled: true } },
            OR: [
              { public_slug: search },
              { specimen: { common_name: search } },
              { specimen: { scientific_name: search } },
              { specimen: { accession_number: search } },
            ],
          },
        }),
      );
      expect(result[0]).toMatchObject({
        arEnabled: true,
        arAssetCount: 2,
      });
    });
  });

  describe('update', () => {
    it('updates content fields without touching the public URL', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      exhibitDelegate.update.mockResolvedValue(
        exhibitRecord({ diet: 'Grass' }),
      );

      await service.update(EXHIBIT_ID, { diet: 'Grass' }, ACCOUNT_ID);

      const { data } = exhibitDelegate.update.mock.calls[0][0] as {
        data: Record<string, unknown>;
      };
      expect(data).toMatchObject({ diet: 'Grass' });
      expect(data).not.toHaveProperty('public_slug');
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
        service.update(EXHIBIT_ID, { diet: 'Grass' }, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('replaceUrl', () => {
    it('replaces the slug and audits both the old and new URL', async () => {
      exhibitDelegate.findUnique
        .mockResolvedValueOnce(exhibitRecord())
        .mockResolvedValueOnce(null);
      exhibitDelegate.update.mockResolvedValue(
        exhibitRecord({ public_slug: 'carabao-v2' }),
      );

      const result = await service.replaceUrl(
        EXHIBIT_ID,
        { publicSlug: 'carabao-v2' },
        ACCOUNT_ID,
      );

      expect(result.publicUrl).toBe(`${SITE}/exhibits/carabao-v2`);
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'REPLACE_EXHIBIT_URL',
          details: {
            previousSlug: 'six-legged-carabao',
            publicSlug: 'carabao-v2',
          },
        }),
      });
    });

    it('rejects the current slug and a slug used by another exhibit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      await expect(
        service.replaceUrl(
          EXHIBIT_ID,
          { publicSlug: 'six-legged-carabao' },
          ACCOUNT_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      exhibitDelegate.findUnique
        .mockResolvedValueOnce(exhibitRecord())
        .mockResolvedValueOnce({ id: 'other' });
      await expect(
        service.replaceUrl(EXHIBIT_ID, { publicSlug: 'taken' }, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(exhibitDelegate.update).not.toHaveBeenCalled();
    });
  });

  describe('retired slugs', () => {
    it('keeps a slug retired by another exhibit reserved', async () => {
      exhibitDelegate.findUnique
        .mockResolvedValueOnce(exhibitRecord())
        .mockResolvedValueOnce(null);
      auditDelegate.findFirst.mockResolvedValue({ id: 'audit-1' });

      await expect(
        service.replaceUrl(
          EXHIBIT_ID,
          { publicSlug: 'old-beetle' },
          ACCOUNT_ID,
        ),
      ).rejects.toThrow('cannot be reused');
      expect(auditDelegate.findFirst).toHaveBeenCalledWith({
        where: {
          action: 'REPLACE_EXHIBIT_URL',
          affected_record_type: 'exhibit',
          details: { path: ['previousSlug'], equals: 'old-beetle' },
          NOT: { affected_record_id: EXHIBIT_ID },
        },
        select: { id: true },
      });
      expect(exhibitDelegate.update).not.toHaveBeenCalled();
    });

    it('lets an exhibit take back a slug it retired itself', async () => {
      exhibitDelegate.findUnique
        .mockResolvedValueOnce(exhibitRecord())
        .mockResolvedValueOnce(null);
      auditDelegate.findFirst.mockResolvedValue(null);
      exhibitDelegate.update.mockResolvedValue(
        exhibitRecord({ public_slug: 'old-beetle' }),
      );

      await expect(
        service.replaceUrl(
          EXHIBIT_ID,
          { publicSlug: 'old-beetle' },
          ACCOUNT_ID,
        ),
      ).resolves.toMatchObject({ publicSlug: 'old-beetle' });
    });
  });

  describe('lifecycle', () => {
    it('publishes an eligible unpublished exhibit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord(FILLED_CONTENT),
      );
      specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
      exhibitDelegate.update.mockResolvedValue(
        exhibitRecord({ status: 'PUBLISHED', published_at: TEST_DATE }),
      );

      const result = await service.publish(EXHIBIT_ID, ACCOUNT_ID);

      expect(result.status).toBe(ExhibitStatus.PUBLISHED);
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'PUBLISH_EXHIBIT',
          details: { previousStatus: 'UNPUBLISHED' },
        }),
      });
    });

    it('blocks publishing when the specimen is no longer eligible', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord(FILLED_CONTENT),
      );
      specimenDelegate.findUnique.mockResolvedValue(
        specimenRecord({ public_display_allowed: false }),
      );

      await expect(
        service.publish(EXHIBIT_ID, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(exhibitDelegate.update).not.toHaveBeenCalled();
    });

    it('rejects publishing a disabled exhibit (no Disabled -> Published in SRS B.3)', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ status: 'DISABLED' }),
      );
      specimenDelegate.findUnique.mockResolvedValue(specimenRecord());

      await expect(service.publish(EXHIBIT_ID, ACCOUNT_ID)).rejects.toThrow(
        'A disabled exhibit cannot be published again.',
      );
      expect(exhibitDelegate.update).not.toHaveBeenCalled();
      expect(auditDelegate.create).not.toHaveBeenCalled();
    });

    it('unpublishes a published exhibit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ status: 'PUBLISHED' }),
      );
      exhibitDelegate.update.mockResolvedValue(exhibitRecord());

      const result = await service.unpublish(EXHIBIT_ID, ACCOUNT_ID);

      expect(result.status).toBe(ExhibitStatus.UNPUBLISHED);
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'UNPUBLISH_EXHIBIT' }),
      });
    });

    it('rejects unpublishing a disabled exhibit and ignores a repeat', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ status: 'DISABLED' }),
      );
      await expect(
        service.unpublish(EXHIBIT_ID, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);

      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      await service.unpublish(EXHIBIT_ID, ACCOUNT_ID);
      expect(exhibitDelegate.update).not.toHaveBeenCalled();
    });

    it('only disables a published exhibit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());

      await expect(service.disable(EXHIBIT_ID, ACCOUNT_ID)).rejects.toThrow(
        'Only a published exhibit can be disabled.',
      );
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
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'DISABLE_EXHIBIT' }),
      });
    });

    it('archives an exhibit and treats repeated archive calls as idempotent', async () => {
      exhibitDelegate.findUnique.mockResolvedValueOnce(exhibitRecord());
      exhibitDelegate.update.mockResolvedValue(
        exhibitRecord({ status: 'DISABLED', archived_at: TEST_DATE }),
      );

      const archived = await service.archive(EXHIBIT_ID, ACCOUNT_ID);
      expect(archived.archivedAt).toEqual(TEST_DATE);

      exhibitDelegate.findUnique.mockResolvedValueOnce(
        exhibitRecord({ archived_at: TEST_DATE }),
      );
      await service.archive(EXHIBIT_ID, ACCOUNT_ID);
      expect(exhibitDelegate.update).toHaveBeenCalledTimes(1);
    });
  });

  describe('public specimen fields and required content (REQ-4.12-03)', () => {
    it('shows every approved field by default on create', async () => {
      specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
      exhibitDelegate.findFirst.mockResolvedValue(null);
      exhibitDelegate.findUnique.mockResolvedValue(null);
      exhibitDelegate.create.mockResolvedValue(exhibitRecord());

      const result = await service.create(
        { specimenId: SPECIMEN_ID, publicSlug: 'six-legged-carabao' },
        ACCOUNT_ID,
      );

      expect(exhibitDelegate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            public_specimen_fields: [...PUBLIC_SPECIMEN_FIELDS],
          }),
        }),
      );
      expect(result.publicSpecimenFields).toEqual([...PUBLIC_SPECIMEN_FIELDS]);
      expect(result.missingForPublish).toEqual([
        'publicDescription',
        'interestingFacts',
        'distribution',
        'diet',
      ]);
    });

    it('stores a chosen selection in allowlist order and audits it', async () => {
      specimenDelegate.findUnique.mockResolvedValue(specimenRecord());
      exhibitDelegate.findFirst.mockResolvedValue(null);
      exhibitDelegate.findUnique.mockResolvedValue(null);
      exhibitDelegate.create.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(exhibitRecord(data)),
      );

      await service.create(
        {
          specimenId: SPECIMEN_ID,
          publicSlug: 'six-legged-carabao',
          publicSpecimenFields: ['habitat', 'commonName', 'family'],
        },
        ACCOUNT_ID,
      );

      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'CREATE_EXHIBIT',
          details: expect.objectContaining({
            publicSpecimenFields: ['commonName', 'family', 'habitat'],
          }),
        }),
      });
    });

    it('updates the selection and audits the previous and current fields', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      exhibitDelegate.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve(exhibitRecord(data)),
      );

      const result = await service.update(
        EXHIBIT_ID,
        { publicSpecimenFields: ['scientificName', 'commonName'] },
        ACCOUNT_ID,
      );

      expect(exhibitDelegate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            public_specimen_fields: ['commonName', 'scientificName'],
          }),
        }),
      );
      expect(result.publicSpecimenFields).toEqual([
        'commonName',
        'scientificName',
      ]);
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'UPDATE_EXHIBIT',
          details: {
            changedFields: ['publicSpecimenFields'],
            publicSpecimenFields: {
              previous: [...PUBLIC_SPECIMEN_FIELDS],
              current: ['commonName', 'scientificName'],
            },
          },
        }),
      });
    });

    it('leaves the visibility diff out of the audit when the selection is unchanged', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      exhibitDelegate.update.mockResolvedValue(exhibitRecord());

      await service.update(
        EXHIBIT_ID,
        { diet: 'Grass', publicSpecimenFields: [...PUBLIC_SPECIMEN_FIELDS] },
        ACCOUNT_ID,
      );

      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          details: { changedFields: ['diet', 'publicSpecimenFields'] },
        }),
      });
    });

    it('refuses to publish until the exhibit content is filled, naming what is missing', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ ...FILLED_CONTENT, diet: '   ', distribution: null }),
      );
      specimenDelegate.findUnique.mockResolvedValue(specimenRecord());

      await expect(service.publish(EXHIBIT_ID, ACCOUNT_ID)).rejects.toThrow(
        'Missing: distribution, diet.',
      );
      expect(exhibitDelegate.update).not.toHaveBeenCalled();
    });

    it('keeps required content on a published exhibit but lets a draft clear it', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ ...FILLED_CONTENT, status: 'PUBLISHED' }),
      );
      await expect(
        service.update(EXHIBIT_ID, { diet: null }, ACCOUNT_ID),
      ).rejects.toThrow('Missing: diet.');
      expect(exhibitDelegate.update).not.toHaveBeenCalled();

      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord(FILLED_CONTENT),
      );
      exhibitDelegate.update.mockResolvedValue(
        exhibitRecord({ ...FILLED_CONTENT, diet: null }),
      );
      await expect(
        service.update(EXHIBIT_ID, { diet: null }, ACCOUNT_ID),
      ).resolves.toMatchObject({ missingForPublish: ['diet'] });
    });

    it('sends only the selected specimen fields on the public page', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        publicRecord({
          ...FILLED_CONTENT,
          public_specimen_fields: ['scientificName', 'family', 'habitat'],
        }),
      );

      const page = await service.findPublishedBySlug('six-legged-carabao');

      expect(page).toMatchObject({
        scientificName: 'Bubalus bubalis',
        taxonomy: { family: 'Bovidae' },
        habitat: 'Wetlands',
        // Exhibit content and media are not affected by the selection.
        publicDescription: 'A rare specimen.',
        diet: 'Grass',
        media: [expect.objectContaining({ isCover: true })],
      });
      for (const hidden of [
        'commonName',
        'collection',
        'ecologicalRole',
        'conservationStatus',
      ]) {
        expect(page).not.toHaveProperty(hidden);
      }
      expect(Object.keys(page.taxonomy ?? {})).toEqual(['family']);
      const serialized = JSON.stringify(page);
      for (const value of [
        'Six-legged Carabao',
        'Mammals',
        'Animalia',
        'Grazer',
      ]) {
        expect(serialized).not.toContain(value);
      }
    });

    it('leaves taxonomy out entirely when no rank is selected', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        publicRecord({ public_specimen_fields: [] }),
      );

      const page = await service.findPublishedBySlug('six-legged-carabao');

      expect(page).not.toHaveProperty('taxonomy');
      expect(page).not.toHaveProperty('commonName');
      expect(page.publicDescription).toBe('A rare specimen.');
    });

    it('never lets an unknown stored key widen the page, and treats a null column as the default', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        publicRecord({
          public_specimen_fields: ['genus', 'remarks', 'accessionNumber'],
        }),
      );
      const narrowed = await service.findPublishedBySlug('six-legged-carabao');
      expect(narrowed.taxonomy).toEqual({ genus: 'Bubalus' });
      expect(JSON.stringify(narrowed)).not.toContain('USCBM-MAM-001');

      exhibitDelegate.findUnique.mockResolvedValue(
        publicRecord({ public_specimen_fields: null }),
      );
      const fallback = await service.findPublishedBySlug('six-legged-carabao');
      expect(fallback).toMatchObject({
        commonName: 'Six-legged Carabao',
        conservationStatus: 'Domesticated',
      });
    });
  });

  describe('setAr', () => {
    const assets = (...enabled: boolean[]) =>
      enabled.map((is_enabled, index) => ({
        id: `asset-${index + 1}`,
        is_enabled,
      }));

    it('enables the uploaded AR assets and audits which ones changed', async () => {
      exhibitDelegate.findUnique
        .mockResolvedValueOnce(exhibitRecord({ ar_asset: assets(false, true) }))
        .mockResolvedValueOnce(exhibitRecord({ ar_asset: assets(true, true) }));

      const result = await service.setAr(
        EXHIBIT_ID,
        { enabled: true },
        ACCOUNT_ID,
      );

      expect(arAssetDelegate.updateMany).toHaveBeenCalledWith({
        where: { exhibit_id: EXHIBIT_ID, is_enabled: false },
        data: { is_enabled: true },
      });
      expect(result).toMatchObject({ arEnabled: true, arAssetCount: 2 });
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'ENABLE_EXHIBIT_AR',
          details: { assetIds: ['asset-1'] },
        }),
      });
    });

    it('disables AR and changes nothing when already in that state', async () => {
      exhibitDelegate.findUnique
        .mockResolvedValueOnce(exhibitRecord({ ar_asset: assets(true) }))
        .mockResolvedValueOnce(exhibitRecord({ ar_asset: assets(false) }));
      const disabled = await service.setAr(
        EXHIBIT_ID,
        { enabled: false },
        ACCOUNT_ID,
      );
      expect(disabled.arEnabled).toBe(false);
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'DISABLE_EXHIBIT_AR' }),
      });

      exhibitDelegate.findUnique.mockResolvedValueOnce(
        exhibitRecord({ ar_asset: assets(false) }),
      );
      await service.setAr(EXHIBIT_ID, { enabled: false }, ACCOUNT_ID);
      expect(arAssetDelegate.updateMany).toHaveBeenCalledTimes(1);
    });

    it('cannot enable AR before a developer uploads an asset', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());

      await expect(
        service.setAr(EXHIBIT_ID, { enabled: true }, ACCOUNT_ID),
      ).rejects.toThrow('No AR asset has been uploaded for this exhibit yet.');
      expect(arAssetDelegate.updateMany).not.toHaveBeenCalled();
    });

    it('rejects AR changes on an archived exhibit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ archived_at: TEST_DATE, ar_asset: assets(false) }),
      );

      await expect(
        service.setAr(EXHIBIT_ID, { enabled: true }, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('QR code and label', () => {
    it('returns a PNG QR code for the public URL', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());

      const image = await service.getQrCode(EXHIBIT_ID, { size: 256 });

      expect(image.contentType).toBe('image/png');
      expect(image.fileName).toBe('six-legged-carabao-qr.png');
      const png = image.body as Buffer;
      expect(png.subarray(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      );
    });

    it('returns the same SVG QR code every time it is regenerated', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());

      const first = await service.getQrCode(EXHIBIT_ID, { format: 'svg' });
      const second = await service.getQrCode(EXHIBIT_ID, { format: 'svg' });

      expect(first.contentType).toBe('image/svg+xml');
      expect(first.body).toContain('<svg');
      expect(second.body).toBe(first.body);
    });

    it('prints the name and the complete human-readable URL on the label', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());

      const label = await service.getLabel(EXHIBIT_ID);

      expect(label.contentType).toBe('image/svg+xml');
      const svg = label.body as string;
      expect(svg).toContain('Six-legged Carabao');
      expect(svg).toContain('Bubalus bubalis');
      const urlLines = [
        ...svg.matchAll(/font-family="monospace"[^>]*>([^<]*)</g),
      ].map((m) => m[1]);
      expect(urlLines.join('')).toBe(`${SITE}/exhibits/six-legged-carabao`);
    });

    it('refuses QR codes and labels when the site URL is not configured in production', async () => {
      const unconfigured = new ExhibitsService(
        prismaMock as unknown as PrismaService,
        storageServiceMock as unknown as StorageService,
        new ExhibitQrService({
          get: (key: string) => (key === 'NODE_ENV' ? 'production' : undefined),
        } as unknown as ConfigService),
      );
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ exhibit_media: [] }),
      );

      await expect(
        unconfigured.getQrCode(EXHIBIT_ID, {}),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(unconfigured.getLabel(EXHIBIT_ID)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      await expect(unconfigured.findOne(EXHIBIT_ID)).resolves.toMatchObject({
        publicUrl: null,
      });
    });

    it('refuses QR codes for archived exhibits', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ archived_at: TEST_DATE }),
      );

      await expect(service.getQrCode(EXHIBIT_ID, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.getLabel(EXHIBIT_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('findPublishedBySlug', () => {
    it('returns approved public fields, media, and no internal data', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(publicRecord());

      const page = await service.findPublishedBySlug('six-legged-carabao');

      expect(page).toMatchObject({
        publicSlug: 'six-legged-carabao',
        commonName: 'Six-legged Carabao',
        scientificName: 'Bubalus bubalis',
        collection: 'Mammals',
        taxonomy: { kingdom: 'Animalia', order: 'Artiodactyla' },
        habitat: 'Wetlands',
        conservationStatus: 'Domesticated',
        publicDescription: 'A rare specimen.',
        media: [
          {
            mediaUrl: `https://signed.example/exhibit-media/${EXHIBIT_ID}/cover.jpg`,
            isCover: true,
          },
        ],
        ar: { available: false, models: [] },
      });
      const serialized = JSON.stringify(page);
      for (const hidden of [
        'USCBM-MAM-001',
        ACCOUNT_ID,
        SPECIMEN_ID,
        'created_by',
        'createdBy',
        'remarks',
      ]) {
        expect(serialized).not.toContain(hidden);
      }
    });

    it('leaves out an image whose file cannot be signed instead of failing', async () => {
      storageServiceMock.createSignedUrl.mockRejectedValue(
        new Error('Object not found'),
      );
      exhibitDelegate.findUnique.mockResolvedValue(publicRecord());

      await expect(
        service.findPublishedBySlug('six-legged-carabao'),
      ).resolves.toMatchObject({
        commonName: 'Six-legged Carabao',
        media: [],
      });
    });

    it('offers AR only while an uploaded asset is enabled', async () => {
      const activeAsset = {
        storage_path: `${EXHIBIT_ID}/model.glb`,
        model_format: 'glb',
      };
      exhibitDelegate.findUnique.mockResolvedValue(
        publicRecord({ ar_asset: [activeAsset] }),
      );
      await expect(
        service.findPublishedBySlug('six-legged-carabao'),
      ).resolves.toMatchObject({
        ar: {
          available: true,
          models: [
            {
              format: 'glb',
              url: `https://signed.example/ar-assets/${EXHIBIT_ID}/model.glb`,
            },
          ],
        },
      });

      // A model whose file cannot be signed is left out; the page still loads.
      storageServiceMock.createSignedUrl.mockImplementation(
        (bucket: string, path: string) =>
          bucket === 'ar-assets'
            ? Promise.reject(new Error('Object not found'))
            : Promise.resolve(`https://signed.example/${bucket}/${path}`),
      );
      exhibitDelegate.findUnique.mockResolvedValue(
        publicRecord({ ar_asset: [activeAsset] }),
      );
      await expect(
        service.findPublishedBySlug('six-legged-carabao'),
      ).resolves.toMatchObject({
        commonName: 'Six-legged Carabao',
        media: [expect.objectContaining({ isCover: true })],
        ar: { available: false, models: [] },
      });

      // No enabled asset (the public query selects enabled ones only).
      exhibitDelegate.findUnique.mockResolvedValue(
        publicRecord({ ar_asset: [] }),
      );
      await expect(
        service.findPublishedBySlug('six-legged-carabao'),
      ).resolves.toMatchObject({ ar: { available: false, models: [] } });
    });

    it.each([
      ['missing', null],
      ['unpublished', publicRecord({ status: 'UNPUBLISHED' })],
      ['disabled', publicRecord({ status: 'DISABLED' })],
      ['archived', publicRecord({ archived_at: TEST_DATE })],
      [
        'no longer public-display approved',
        publicRecord({
          specimen: {
            ...publicRecord().specimen,
            public_display_allowed: false,
          },
        }),
      ],
    ])(
      'shows the same safe 404 when the page is %s',
      async (_label, record) => {
        exhibitDelegate.findUnique.mockResolvedValue(record);

        await expect(
          service.findPublishedBySlug('six-legged-carabao'),
        ).rejects.toThrow(
          'No published exhibit found for "six-legged-carabao".',
        );
      },
    );
  });

  describe('media', () => {
    const file = {
      buffer: Buffer.from('img'),
      mimetype: 'image/jpeg',
    } as Express.Multer.File;

    it('uploads media, resets the prior cover, and returns a preview URL', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      storageServiceMock.upload.mockResolvedValue(`${EXHIBIT_ID}/photo.jpg`);
      exhibitMediaDelegate.create.mockResolvedValue(
        mediaRecord({ is_cover: true }),
      );

      const media = await service.addMedia(
        EXHIBIT_ID,
        file,
        { isCover: true },
        ACCOUNT_ID,
      );

      expect(exhibitMediaDelegate.updateMany).toHaveBeenCalledWith({
        where: { exhibit_id: EXHIBIT_ID, is_cover: true },
        data: { is_cover: false },
      });
      expect(media).toMatchObject({
        isCover: true,
        previewUrl: `https://signed.example/exhibit-media/${EXHIBIT_ID}/photo.jpg`,
      });
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'ADD_EXHIBIT_MEDIA' }),
      });
    });

    it('removes the uploaded file when the database write fails', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      storageServiceMock.upload.mockResolvedValue(`${EXHIBIT_ID}/photo.jpg`);
      exhibitMediaDelegate.create.mockRejectedValue(new Error('db down'));
      storageServiceMock.remove.mockResolvedValue(undefined);

      await expect(
        service.addMedia(EXHIBIT_ID, file, {}, ACCOUNT_ID),
      ).rejects.toThrow('db down');
      expect(storageServiceMock.remove).toHaveBeenCalledWith(
        'exhibit-media',
        `${EXHIBIT_ID}/photo.jpg`,
      );
    });

    it('rejects media upload for an archived exhibit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ archived_at: TEST_DATE }),
      );

      await expect(
        service.addMedia(EXHIBIT_ID, file, {}, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(storageServiceMock.upload).not.toHaveBeenCalled();
    });

    it('edits a caption and makes an image the only cover', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      exhibitMediaDelegate.findUnique.mockResolvedValue(mediaRecord());
      exhibitMediaDelegate.update.mockResolvedValue(
        mediaRecord({ caption: 'Side view', is_cover: true }),
      );

      const media = await service.updateMedia(
        EXHIBIT_ID,
        MEDIA_ID,
        { caption: 'Side view', isCover: true },
        ACCOUNT_ID,
      );

      expect(exhibitMediaDelegate.updateMany).toHaveBeenCalledWith({
        where: {
          exhibit_id: EXHIBIT_ID,
          is_cover: true,
          id: { not: MEDIA_ID },
        },
        data: { is_cover: false },
      });
      expect(exhibitMediaDelegate.update).toHaveBeenCalledWith({
        where: { id: MEDIA_ID },
        data: { caption: 'Side view', is_cover: true },
      });
      expect(media).toMatchObject({ caption: 'Side view', isCover: true });
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: 'UPDATE_EXHIBIT_MEDIA' }),
      });
    });

    it('rejects an empty media edit and media from another exhibit', async () => {
      await expect(
        service.updateMedia(EXHIBIT_ID, MEDIA_ID, {}, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);

      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      exhibitMediaDelegate.findUnique.mockResolvedValue(
        mediaRecord({ exhibit_id: 'another-exhibit' }),
      );
      await expect(
        service.updateMedia(EXHIBIT_ID, MEDIA_ID, { caption: 'x' }, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('removes media, audits it in the same transaction, and cleans up storage', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      exhibitMediaDelegate.findUnique.mockResolvedValue(mediaRecord());
      storageServiceMock.remove.mockResolvedValue(undefined);

      await expect(
        service.removeMedia(EXHIBIT_ID, MEDIA_ID, ACCOUNT_ID),
      ).resolves.toEqual({ id: MEDIA_ID, removed: true });
      expect(transactionMock).toHaveBeenCalledTimes(1);
      expect(exhibitMediaDelegate.delete).toHaveBeenCalledWith({
        where: { id: MEDIA_ID },
      });
      expect(auditDelegate.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'REMOVE_EXHIBIT_MEDIA',
          details: { mediaId: MEDIA_ID },
        }),
      });
      expect(storageServiceMock.remove).toHaveBeenCalledWith(
        'exhibit-media',
        `${EXHIBIT_ID}/photo.jpg`,
      );
    });

    it('rejects removing media from an archived exhibit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(
        exhibitRecord({ archived_at: TEST_DATE }),
      );
      exhibitMediaDelegate.findUnique.mockResolvedValue(mediaRecord());

      await expect(
        service.removeMedia(EXHIBIT_ID, MEDIA_ID, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(exhibitMediaDelegate.delete).not.toHaveBeenCalled();
      expect(storageServiceMock.remove).not.toHaveBeenCalled();
    });

    it('keeps the stored file when the audit write fails, so the rolled-back row still has it', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      exhibitMediaDelegate.findUnique.mockResolvedValue(mediaRecord());
      auditDelegate.create.mockRejectedValue(new Error('audit down'));

      await expect(
        service.removeMedia(EXHIBIT_ID, MEDIA_ID, ACCOUNT_ID),
      ).rejects.toThrow('audit down');
      expect(storageServiceMock.remove).not.toHaveBeenCalled();
    });

    it('404s when removing media that does not belong to the exhibit', async () => {
      exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
      exhibitMediaDelegate.findUnique.mockResolvedValue(
        mediaRecord({ exhibit_id: 'another-exhibit' }),
      );

      await expect(
        service.removeMedia(EXHIBIT_ID, MEDIA_ID, ACCOUNT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(exhibitMediaDelegate.delete).not.toHaveBeenCalled();
    });
  });
});
