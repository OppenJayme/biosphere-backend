import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { DeveloperService } from './developer.service';
import { PrismaService } from '../prisma/prisma.service';
import { SUPABASE_CLIENT } from '../supabase/supabase-client.provider';
import { StorageService } from '../supabase/storage.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const prismaMock = {
  userAccount: {
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  arAsset: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findUnique: jest.fn(),
  },
  exhibit: {
    findUnique: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

const supabaseMock = {
  auth: {
    admin: {
      inviteUserByEmail: jest.fn(),
    },
  },
};

const storageServiceMock = {
  upload: jest.fn(),
  remove: jest.fn(),
};

// A valid-looking .glb "file" for AR asset tests.
function fakeFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'model.glb',
    encoding: '7bit',
    mimetype: 'model/gltf-binary',
    size: 1024,
    buffer: Buffer.from('fake glb bytes'),
    destination: '',
    filename: '',
    path: '',
    stream: undefined as never,
    ...overrides,
  };
}

const ACTING_DEVELOPER_ID = 'dev-uuid-1';

describe('DeveloperService', () => {
  let service: DeveloperService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.auditLog.create.mockResolvedValue({});
    storageServiceMock.remove.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeveloperService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: SUPABASE_CLIENT, useValue: supabaseMock },
        { provide: StorageService, useValue: storageServiceMock },
      ],
    }).compile();

    service = module.get<DeveloperService>(DeveloperService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================================
  // listCuratorAccounts
  // ===========================================================
  describe('listCuratorAccounts', () => {
    it('queries only CURATOR-role accounts, newest first', async () => {
      prismaMock.userAccount.findMany.mockResolvedValue([{ id: 'a' }]);

      const result = await service.listCuratorAccounts();

      expect(prismaMock.userAccount.findMany).toHaveBeenCalledWith({
        where: { role: 'CURATOR' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([{ id: 'a' }]);
    });
  });

  // ===========================================================
  // onboardInitialCurator — REQ-4.2-02
  // ===========================================================
  describe('onboardInitialCurator', () => {
    const dto = { email: 'new.curator@example.com', fullName: 'New Curator' };

    it('invites, creates the user_account row, and records a SUCCESS audit entry', async () => {
      supabaseMock.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: { user: { id: 'auth-user-1' } },
        error: null,
      });
      const createdAccount = {
        id: 'account-1',
        authUserId: 'auth-user-1',
        fullName: dto.fullName,
        role: 'CURATOR',
        status: 'ACTIVE',
      };
      prismaMock.userAccount.create.mockResolvedValue(createdAccount);

      const result = await service.onboardInitialCurator(dto, ACTING_DEVELOPER_ID);

      expect(supabaseMock.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
        dto.email,
        { data: { role: 'CURATOR' } },
      );
      expect(prismaMock.userAccount.create).toHaveBeenCalledWith({
        data: {
          authUserId: 'auth-user-1',
          fullName: dto.fullName,
          role: 'CURATOR',
          status: 'ACTIVE',
        },
      });
      expect(result).toEqual(createdAccount);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ONBOARD_CURATOR',
            status: 'SUCCESS',
            affectedRecordId: 'account-1',
          }),
        }),
      );
    });

    it('throws ConflictException and audits FAILED when the invite errors', async () => {
      supabaseMock.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: null,
        error: { message: 'User already registered' },
      });

      await expect(
        service.onboardInitialCurator(dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.userAccount.create).not.toHaveBeenCalled();
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'ONBOARD_CURATOR', status: 'FAILED' }),
        }),
      );
    });

    it('throws InternalServerErrorException and audits FAILED when the account row cannot be created', async () => {
      supabaseMock.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: { user: { id: 'auth-user-2' } },
        error: null,
      });
      prismaMock.userAccount.create.mockRejectedValue(new Error('unique constraint'));

      await expect(
        service.onboardInitialCurator(dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'ONBOARD_CURATOR', status: 'FAILED' }),
        }),
      );
    });
  });

  // ===========================================================
  // updateCuratorStatus — REQ-4.2-03
  // ===========================================================
  describe('updateCuratorStatus', () => {
    const dto = { status: 'INACTIVE' as const, authorizationReason: 'formally authorized' };

    it('throws NotFoundException when the account does not exist', async () => {
      prismaMock.userAccount.findUnique.mockResolvedValue(null);

      await expect(
        service.updateCuratorStatus('missing-id', dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.userAccount.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException and audits DENIED when the target is a Developer account', async () => {
      prismaMock.userAccount.findUnique.mockResolvedValue({
        id: 'dev-2',
        role: 'DEVELOPER',
      });

      await expect(
        service.updateCuratorStatus('dev-2', dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.userAccount.update).not.toHaveBeenCalled();
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'UPDATE_CURATOR_STATUS', status: 'DENIED' }),
        }),
      );
    });

    it('updates status and audits SUCCESS for a valid curator account', async () => {
      prismaMock.userAccount.findUnique.mockResolvedValue({
        id: 'cur-1',
        role: 'CURATOR',
      });
      const updated = { id: 'cur-1', role: 'CURATOR', status: 'INACTIVE' };
      prismaMock.userAccount.update.mockResolvedValue(updated);

      const result = await service.updateCuratorStatus('cur-1', dto, ACTING_DEVELOPER_ID);

      expect(prismaMock.userAccount.update).toHaveBeenCalledWith({
        where: { id: 'cur-1' },
        data: { status: 'INACTIVE' },
      });
      expect(result).toEqual(updated);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'UPDATE_CURATOR_STATUS',
            status: 'SUCCESS',
            details: expect.objectContaining({ authorizationReason: dto.authorizationReason }),
          }),
        }),
      );
    });

    it('throws InternalServerErrorException and audits FAILED when the update fails', async () => {
      prismaMock.userAccount.findUnique.mockResolvedValue({ id: 'cur-1', role: 'CURATOR' });
      prismaMock.userAccount.update.mockRejectedValue(new Error('db down'));

      await expect(
        service.updateCuratorStatus('cur-1', dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'UPDATE_CURATOR_STATUS', status: 'FAILED' }),
        }),
      );
    });
  });

  // ===========================================================
  // createArAsset — REQ-4.2-04 / REQ-4.2-05
  // ===========================================================
  describe('createArAsset', () => {
    const dto = { exhibitId: 'exhibit-1', modelFormat: 'glb' as const, isEnabled: false };

    it('throws NotFoundException when the exhibit does not exist', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue(null);

      await expect(
        service.createArAsset(fakeFile(), dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(NotFoundException);
      expect(storageServiceMock.upload).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the exhibit is archived', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({ id: 'exhibit-1', archivedAt: new Date() });

      await expect(
        service.createArAsset(fakeFile(), dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(BadRequestException);
      expect(storageServiceMock.upload).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when no file is provided', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({ id: 'exhibit-1', archivedAt: null });

      await expect(
        service.createArAsset(undefined as never, dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the file exceeds the size limit', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({ id: 'exhibit-1', archivedAt: null });
      const oversized = fakeFile({ size: 100 * 1024 * 1024 });

      await expect(
        service.createArAsset(oversized, dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the file extension does not match modelFormat', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({ id: 'exhibit-1', archivedAt: null });
      const wrongExt = fakeFile({ originalname: 'model.gltf' });

      await expect(
        service.createArAsset(wrongExt, dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('uploads then creates the row on success, and audits SUCCESS', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({ id: 'exhibit-1', archivedAt: null });
      storageServiceMock.upload.mockResolvedValue('exhibit-1/some-path.glb');
      const createdRow = {
        id: 'asset-1',
        exhibitId: 'exhibit-1',
        modelUrl: 'exhibit-1/some-path.glb',
        modelFormat: 'glb',
        isEnabled: false,
      };
      prismaMock.arAsset.create.mockResolvedValue(createdRow);

      const result = await service.createArAsset(fakeFile(), dto, ACTING_DEVELOPER_ID);

      expect(storageServiceMock.upload).toHaveBeenCalledWith(
        'ar-assets',
        expect.stringMatching(/^exhibit-1\/.+\.glb$/),
        expect.any(Buffer),
        'model/gltf-binary',
      );
      expect(result).toEqual(createdRow);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CREATE_AR_ASSET', status: 'SUCCESS' }),
        }),
      );
    });

    it('cleans up the uploaded file and audits FAILED when the DB insert fails', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({ id: 'exhibit-1', archivedAt: null });
      storageServiceMock.upload.mockResolvedValue('exhibit-1/some-path.glb');
      prismaMock.arAsset.create.mockRejectedValue(new Error('insert failed'));

      await expect(
        service.createArAsset(fakeFile(), dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(storageServiceMock.remove).toHaveBeenCalledWith(
        'ar-assets',
        expect.stringMatching(/^exhibit-1\/.+\.glb$/),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CREATE_AR_ASSET', status: 'FAILED' }),
        }),
      );
    });
  });

  // ===========================================================
  // updateArAsset — REQ-4.2-04
  // ===========================================================
  describe('updateArAsset', () => {
    const existingAsset = {
      id: 'asset-1',
      exhibitId: 'exhibit-1',
      modelUrl: 'exhibit-1/old-path.glb',
      modelFormat: 'glb',
      isEnabled: false,
    };

    it('throws NotFoundException when the asset does not exist', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(null);

      await expect(
        service.updateArAsset('missing', undefined, {}, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the existing asset unchanged when no file and no fields are given', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(existingAsset);

      const result = await service.updateArAsset('asset-1', undefined, {}, ACTING_DEVELOPER_ID);

      expect(result).toEqual(existingAsset);
      expect(prismaMock.arAsset.update).not.toHaveBeenCalled();
    });

    it('toggles isEnabled only, without touching storage', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(existingAsset);
      prismaMock.arAsset.update.mockResolvedValue({ ...existingAsset, isEnabled: true });

      const result = await service.updateArAsset(
        'asset-1',
        undefined,
        { isEnabled: true },
        ACTING_DEVELOPER_ID,
      );

      expect(prismaMock.arAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { isEnabled: true },
      });
      expect(storageServiceMock.upload).not.toHaveBeenCalled();
      expect(result.isEnabled).toBe(true);
    });

    it('replaces the file, updates model_url/model_format, and removes the old file', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(existingAsset);
      storageServiceMock.upload.mockResolvedValue('exhibit-1/new-path.glb');
      const updatedRow = { ...existingAsset, modelUrl: 'exhibit-1/new-path.glb' };
      prismaMock.arAsset.update.mockResolvedValue(updatedRow);

      const result = await service.updateArAsset(
        'asset-1',
        fakeFile(),
        {},
        ACTING_DEVELOPER_ID,
      );

      expect(storageServiceMock.upload).toHaveBeenCalled();
      expect(result).toEqual(updatedRow);
      expect(storageServiceMock.remove).toHaveBeenCalledWith(
        'ar-assets',
        'exhibit-1/old-path.glb',
      );
    });

    it('does not remove the old file if the DB update fails', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(existingAsset);
      storageServiceMock.upload.mockResolvedValue('exhibit-1/new-path.glb');
      prismaMock.arAsset.update.mockRejectedValue(new Error('update failed'));

      await expect(
        service.updateArAsset('asset-1', fakeFile(), {}, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(storageServiceMock.remove).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when reassigned to a non-existent exhibit', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(existingAsset);
      prismaMock.exhibit.findUnique.mockResolvedValue(null);

      await expect(
        service.updateArAsset(
          'asset-1',
          undefined,
          { exhibitId: 'nonexistent-exhibit' },
          ACTING_DEVELOPER_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================
  // setArAssetEnabled — REQ-4.2-04 (activate/deactivate)
  // ===========================================================
  describe('setArAssetEnabled', () => {
    it('throws NotFoundException for an unknown asset', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(null);

      await expect(
        service.setArAssetEnabled('missing', true, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('activates and audits ACTIVATE_AR_ASSET', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue({ id: 'asset-1' });
      prismaMock.arAsset.update.mockResolvedValue({ id: 'asset-1', isEnabled: true });

      const result = await service.setArAssetEnabled('asset-1', true, ACTING_DEVELOPER_ID);

      expect(result.isEnabled).toBe(true);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'ACTIVATE_AR_ASSET', status: 'SUCCESS' }),
        }),
      );
    });

    it('deactivates and audits DEACTIVATE_AR_ASSET', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue({ id: 'asset-1' });
      prismaMock.arAsset.update.mockResolvedValue({ id: 'asset-1', isEnabled: false });

      await service.setArAssetEnabled('asset-1', false, ACTING_DEVELOPER_ID);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'DEACTIVATE_AR_ASSET', status: 'SUCCESS' }),
        }),
      );
    });

    it('throws InternalServerErrorException and audits FAILED when the update fails', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue({ id: 'asset-1' });
      prismaMock.arAsset.update.mockRejectedValue(new Error('db error'));

      await expect(
        service.setArAssetEnabled('asset-1', true, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'ACTIVATE_AR_ASSET', status: 'FAILED' }),
        }),
      );
    });
  });

  // ===========================================================
  // removeArAsset — REQ-4.2-04
  // ===========================================================
  describe('removeArAsset', () => {
    it('throws NotFoundException for an unknown asset', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(null);

      await expect(
        service.removeArAsset('missing', ACTING_DEVELOPER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes the row, removes the storage object, and audits SUCCESS', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue({
        id: 'asset-1',
        modelUrl: 'exhibit-1/some-path.glb',
      });
      prismaMock.arAsset.delete.mockResolvedValue({});

      const result = await service.removeArAsset('asset-1', ACTING_DEVELOPER_ID);

      expect(prismaMock.arAsset.delete).toHaveBeenCalledWith({ where: { id: 'asset-1' } });
      expect(storageServiceMock.remove).toHaveBeenCalledWith(
        'ar-assets',
        'exhibit-1/some-path.glb',
      );
      expect(result).toEqual({ id: 'asset-1', removed: true });
    });

    it('does not touch storage and audits FAILED when the delete fails', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue({
        id: 'asset-1',
        modelUrl: 'exhibit-1/some-path.glb',
      });
      prismaMock.arAsset.delete.mockRejectedValue(new Error('fk violation'));

      await expect(
        service.removeArAsset('asset-1', ACTING_DEVELOPER_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(storageServiceMock.remove).not.toHaveBeenCalled();
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'REMOVE_AR_ASSET', status: 'FAILED' }),
        }),
      );
    });
  });

  // ===========================================================
  // Audit logging resilience — REQ-4.2-09
  // ===========================================================
  describe('audit logging failures never mask the primary result', () => {
    it('still returns the updated asset even if audit_log insert fails', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue({ id: 'asset-1' });
      prismaMock.arAsset.update.mockResolvedValue({ id: 'asset-1', isEnabled: true });
      prismaMock.auditLog.create.mockRejectedValue(new Error('audit table unreachable'));

      const result = await service.setArAssetEnabled('asset-1', true, ACTING_DEVELOPER_ID);

      expect(result).toEqual({ id: 'asset-1', isEnabled: true });
    });
  });
});