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
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import { StorageService } from '../supabase/storage.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const prismaMock = {
  user_account: {
    findMany: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  ar_asset: {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    findUnique: jest.fn(),
  },
  exhibit: {
    findUnique: jest.fn(),
  },
  audit_log: {
    create: jest.fn(),
  },
};

const supabaseMock = {
  auth: {
    admin: {
      inviteUserByEmail: jest.fn(),
      updateUserById: jest.fn(),
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

const ACTING_DEVELOPER_AUTH_ID = 'auth-dev-uuid-1';
const ACTING_DEVELOPER_ACCOUNT_ID = 'account-dev-uuid-1';


describe('DeveloperService', () => {
  let service: DeveloperService;

  beforeEach(async () => {
    jest.clearAllMocks();
    prismaMock.audit_log.create.mockResolvedValue({});
    supabaseMock.auth.admin.updateUserById.mockResolvedValue({ data: {}, error: null });
    storageServiceMock.remove.mockResolvedValue(undefined);

    prismaMock.user_account.findUnique.mockResolvedValue({
      id: ACTING_DEVELOPER_ACCOUNT_ID,
    })

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
    it('queries only CURATOR-role accounts, newest first, and maps to camelCase entities', async () => {
      const row = {
        id: 'a',
        auth_user_id: 'auth-a',
        full_name: 'Curator A',
        role: 'CURATOR',
        status: 'ACTIVE',
        avatar_path: null,
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      };
      
      prismaMock.user_account.findMany.mockResolvedValue([row]);

      const result = await service.listCuratorAccounts();

      expect(prismaMock.user_account.findMany).toHaveBeenCalledWith({
        where: { role: 'CURATOR' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual([
         {
          id: 'a',
          authUserId: 'auth-a',
          fullName: 'Curator A',
          role: 'CURATOR',
          status: 'ACTIVE',
          avatarPath: null,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        },
      ]);
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
      const createdRow = {
        id: 'account-1',
        auth_user_id: 'auth-user-1',
        full_name: dto.fullName,
        role: 'CURATOR',
        status: 'ACTIVE',
        avatar_path: null,
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-01'),
      };
      prismaMock.user_account.create.mockResolvedValue(createdRow);

      const result = await service.onboardInitialCurator(dto, ACTING_DEVELOPER_AUTH_ID);

      expect(supabaseMock.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(dto.email);
      expect(supabaseMock.auth.admin.updateUserById).toHaveBeenCalledWith(
        'auth-user-1',
        { app_metadata: { role: 'CURATOR' } },
      );
      expect(prismaMock.user_account.create).toHaveBeenCalledWith({
        data: {
          auth_user_id: 'auth-user-1',
          full_name: dto.fullName,
          role: 'CURATOR',
          status: 'ACTIVE',
        },
      });
      expect(result).toEqual({
        id: 'account-1',
        authUserId: 'auth-user-1',
        fullName: dto.fullName,
        role: 'CURATOR',
        status: 'ACTIVE',
        avatarPath: null,
        createdAt: createdRow.created_at,
        updatedAt: createdRow.updated_at,
      });
      expect(prismaMock.audit_log.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ONBOARD_CURATOR',
            status: 'SUCCESS',
            affected_record_id: 'account-1',
            user_id: ACTING_DEVELOPER_ACCOUNT_ID,
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
        service.onboardInitialCurator(dto, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(ConflictException);

      expect(prismaMock.user_account.create).not.toHaveBeenCalled();
      expect(prismaMock.audit_log.create).toHaveBeenCalledWith(
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
      prismaMock.user_account.create.mockRejectedValue(new Error('unique constraint'));

      await expect(
        service.onboardInitialCurator(dto, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(prismaMock.audit_log.create).toHaveBeenCalledWith(
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
      prismaMock.user_account.findUnique.mockImplementation(({ where }) =>
        where?.auth_user_id
          ? Promise.resolve({ id: ACTING_DEVELOPER_ACCOUNT_ID })
          : Promise.resolve(null),
      );

      await expect(
        service.updateCuratorStatus('missing-id', dto, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(NotFoundException);
      expect(prismaMock.user_account.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException and audits DENIED when the target is a Developer account', async () => {
      prismaMock.user_account.findUnique.mockImplementation(({ where }) => 
        where?.auth_user_id
          ? Promise.resolve({ id: ACTING_DEVELOPER_ACCOUNT_ID })
          : Promise.resolve({ id: 'dev-2', role: 'DEVELOPER' }),
      );

      await expect(
        service.updateCuratorStatus('dev-2', dto, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(ForbiddenException);

      expect(prismaMock.user_account.update).not.toHaveBeenCalled();
      expect(prismaMock.audit_log.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'UPDATE_CURATOR_STATUS', status: 'DENIED' }),
        }),
      );
    });

    it('updates status and audits SUCCESS for a valid curator account', async () => {
      prismaMock.user_account.findUnique.mockImplementation(({ where }) =>
        where?.auth_user_id
          ? Promise.resolve({ id: ACTING_DEVELOPER_ACCOUNT_ID })
          : Promise.resolve({ id: 'cur-1', role: 'CURATOR' }),
      );
      const updatedRow = {
        id: 'cur-1',
        auth_user_id: 'auth-cur-1',
        full_name: 'Curator One',
        role: 'CURATOR',
        status: 'INACTIVE',
        avatar_path: null,
        created_at: new Date('2026-01-01'),
        updated_at: new Date('2026-01-02'),
      };

      prismaMock.user_account.update.mockResolvedValue(updatedRow);

      const result = await service.updateCuratorStatus('cur-1', dto, ACTING_DEVELOPER_AUTH_ID);

      expect(prismaMock.user_account.update).toHaveBeenCalledWith({
        where: { id: 'cur-1' },
        data: { status: 'INACTIVE' },
      });
      expect(result).toEqual({
        id: 'cur-1',
        authUserId: 'auth-cur-1',
        fullName: 'Curator One',
        role: 'CURATOR',
        status: 'INACTIVE',
        avatarPath: null,
        createdAt: updatedRow.created_at,
        updatedAt: updatedRow.updated_at,
      });
      expect(prismaMock.audit_log.create).toHaveBeenCalledWith(
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
      prismaMock.user_account.findUnique.mockImplementation(({ where }) =>
        where?.auth_user_id
          ? Promise.resolve({ id: ACTING_DEVELOPER_ACCOUNT_ID })
          : Promise.resolve({ id: 'cur-1', role: 'CURATOR' }),
      );
      prismaMock.user_account.update.mockRejectedValue(new Error('db down'));

      await expect(
        service.updateCuratorStatus('cur-1', dto, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(prismaMock.audit_log.create).toHaveBeenCalledWith(
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
        service.createArAsset(fakeFile(), dto, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(NotFoundException);
      expect(storageServiceMock.upload).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the exhibit is archived', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({ id: 'exhibit-1', archivedAt: new Date() });

      await expect(
        service.createArAsset(fakeFile(), dto, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(BadRequestException);
      expect(storageServiceMock.upload).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when no file is provided', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({ id: 'exhibit-1', archivedAt: null });

      await expect(
        service.createArAsset(undefined as never, dto, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the file exceeds the size limit', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({ id: 'exhibit-1', archivedAt: null });
      const oversized = fakeFile({ size: 100 * 1024 * 1024 });

      await expect(
        service.createArAsset(oversized, dto, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the file extension does not match modelFormat', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({ id: 'exhibit-1', archivedAt: null });
      const wrongExt = fakeFile({ originalname: 'model.gltf' });

      await expect(
        service.createArAsset(wrongExt, dto, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('uploads then creates the row on success, and audits SUCCESS', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({ id: 'exhibit-1', archivedAt: null });
      storageServiceMock.upload.mockResolvedValue('exhibit-1/some-path.glb');
      const createdRow = {
        id: 'asset-1',
        exhibit_id: 'exhibit-1',
        storage_path: 'exhibit-1/some-path.glb',
        model_format: 'glb',
        is_enabled: false,
      };
      prismaMock.ar_asset.create.mockResolvedValue(createdRow);

      const result = await service.createArAsset(fakeFile(), dto, ACTING_DEVELOPER_AUTH_ID);

      expect(storageServiceMock.upload).toHaveBeenCalledWith(
        'ar-assets',
        expect.stringMatching(/^exhibit-1\/.+\.glb$/),
        expect.any(Buffer),
        'model/gltf-binary',
      );
      expect(result).toEqual({
        id: 'asset-1',
        exhibitId: 'exhibit-1',
        modelUrl: 'exhibit-1/some-path.glb',
        modelFormat: 'glb',
        isEnabled: false,
      });
      expect(prismaMock.audit_log.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'CREATE_AR_ASSET', status: 'SUCCESS' }),
        }),
      );
    });

    it('cleans up the uploaded file and audits FAILED when the DB insert fails', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({ id: 'exhibit-1', archivedAt: null });
      storageServiceMock.upload.mockResolvedValue('exhibit-1/some-path.glb');
      prismaMock.ar_asset.create.mockRejectedValue(new Error('insert failed'));

      await expect(
        service.createArAsset(fakeFile(), dto, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(storageServiceMock.remove).toHaveBeenCalledWith(
        'ar-assets',
        expect.stringMatching(/^exhibit-1\/.+\.glb$/),
      );
      expect(prismaMock.audit_log.create).toHaveBeenCalledWith(
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
    const existingRow = {
      id: 'asset-1',
      exhibit_id: 'exhibit-1',
      storage_path: 'exhibit-1/old-path.glb',
      model_format: 'glb',
      is_enabled: false,
    };

    it('throws NotFoundException when the asset does not exist', async () => {
      prismaMock.ar_asset.findUnique.mockResolvedValue(null);

      await expect(
        service.updateArAsset('missing', undefined, {}, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the existing asset unchanged when no file and no fields are given', async () => {
      prismaMock.ar_asset.findUnique.mockResolvedValue(existingRow);

      const result = await service.updateArAsset('asset-1', undefined, {}, ACTING_DEVELOPER_AUTH_ID);

      expect(result).toEqual({
        id: 'asset-1',
        exhibitId: 'exhibit-1',
        modelUrl: 'exhibit-1/old-path.glb',
        modelFormat: 'glb',
        isEnabled: false,
      });
      expect(prismaMock.ar_asset.update).not.toHaveBeenCalled();
    });

    it('toggles isEnabled only, without touching storage', async () => {
      prismaMock.ar_asset.findUnique.mockResolvedValue(existingRow);
      prismaMock.ar_asset.update.mockResolvedValue({ ...existingRow, isEnabled: true });

      const result = await service.updateArAsset(
        'asset-1',
        undefined,
        { isEnabled: true },
        ACTING_DEVELOPER_AUTH_ID,
      );

      expect(prismaMock.ar_asset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { isEnabled: true },
      });
      expect(storageServiceMock.upload).not.toHaveBeenCalled();
      expect(result.isEnabled).toBe(true);
    });

    it('replaces the file, updates model_url/model_format, and removes the old file', async () => {
      prismaMock.ar_asset.findUnique.mockResolvedValue(existingRow);
      storageServiceMock.upload.mockResolvedValue('exhibit-1/new-path.glb');
      const updatedRow = { ...existingRow, modelUrl: 'exhibit-1/new-path.glb' };
      prismaMock.ar_asset.update.mockResolvedValue(updatedRow);

      const result = await service.updateArAsset(
        'asset-1',
        fakeFile(),
        {},
        ACTING_DEVELOPER_AUTH_ID,
      );

      expect(storageServiceMock.upload).toHaveBeenCalled();
      expect(result).toEqual({
        id: 'asset-1',
        exhibitId: 'exhibit-1',
        modelUrl: 'exhibit-1/new-path.glb',
        modelFormat: 'glb',
        isEnabled: false,
      });
      expect(storageServiceMock.remove).toHaveBeenCalledWith(
        'ar-assets',
        'exhibit-1/old-path.glb',
      );
    });

    it('does not remove the old file if the DB update fails', async () => {
      prismaMock.ar_asset.findUnique.mockResolvedValue(existingRow);
      storageServiceMock.upload.mockResolvedValue('exhibit-1/new-path.glb');
      prismaMock.ar_asset.update.mockRejectedValue(new Error('update failed'));

      await expect(
        service.updateArAsset('asset-1', fakeFile(), {}, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(storageServiceMock.remove).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when reassigned to a non-existent exhibit', async () => {
      prismaMock.ar_asset.findUnique.mockResolvedValue(existingRow);
      prismaMock.exhibit.findUnique.mockResolvedValue(null);

      await expect(
        service.updateArAsset(
          'asset-1',
          undefined,
          { exhibitId: 'nonexistent-exhibit' },
          ACTING_DEVELOPER_AUTH_ID,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================================
  // setArAssetEnabled — REQ-4.2-04 (activate/deactivate)
  // ===========================================================
  describe('setArAssetEnabled', () => {
    it('throws NotFoundException for an unknown asset', async () => {
      prismaMock.ar_asset.findUnique.mockResolvedValue(null);

      await expect(
        service.setArAssetEnabled('missing', true, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('activates and audits ACTIVATE_AR_ASSET', async () => {
      prismaMock.ar_asset.findUnique.mockResolvedValue({ id: 'asset-1' });
      prismaMock.ar_asset.update.mockResolvedValue({ id: 'asset-1', isEnabled: true });

      const result = await service.setArAssetEnabled('asset-1', true, ACTING_DEVELOPER_AUTH_ID);

      expect(prismaMock.ar_asset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { is_enabled: true },
      });
      expect(result.isEnabled).toBe(true);
      expect(prismaMock.audit_log.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'ACTIVATE_AR_ASSET', status: 'SUCCESS' }),
        }),
      );
    });

    it('deactivates and audits DEACTIVATE_AR_ASSET', async () => {
      prismaMock.ar_asset.findUnique.mockResolvedValue({ id: 'asset-1' });
      prismaMock.ar_asset.update.mockResolvedValue({ id: 'asset-1', isEnabled: false });

      await service.setArAssetEnabled('asset-1', false, ACTING_DEVELOPER_AUTH_ID);

      expect(prismaMock.audit_log.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'DEACTIVATE_AR_ASSET', status: 'SUCCESS' }),
        }),
      );
    });

    it('throws InternalServerErrorException and audits FAILED when the update fails', async () => {
      prismaMock.ar_asset.findUnique.mockResolvedValue({ id: 'asset-1' });
      prismaMock.ar_asset.update.mockRejectedValue(new Error('db error'));

      await expect(
        service.setArAssetEnabled('asset-1', true, ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(prismaMock.audit_log.create).toHaveBeenCalledWith(
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
      prismaMock.ar_asset.findUnique.mockResolvedValue(null);

      await expect(
        service.removeArAsset('missing', ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes the row, removes the storage object, and audits SUCCESS', async () => {
      prismaMock.ar_asset.findUnique.mockResolvedValue({
        id: 'asset-1',
        modelUrl: 'exhibit-1/some-path.glb',
      });
      prismaMock.ar_asset.delete.mockResolvedValue({});

      const result = await service.removeArAsset('asset-1', ACTING_DEVELOPER_AUTH_ID);

      expect(prismaMock.ar_asset.delete).toHaveBeenCalledWith({ where: { id: 'asset-1' } });
      expect(storageServiceMock.remove).toHaveBeenCalledWith(
        'ar-assets',
        'exhibit-1/some-path.glb',
      );
      expect(result).toEqual({ id: 'asset-1', removed: true });
    });

    it('does not touch storage and audits FAILED when the delete fails', async () => {
      prismaMock.ar_asset.findUnique.mockResolvedValue({
        id: 'asset-1',
        modelUrl: 'exhibit-1/some-path.glb',
      });
      prismaMock.ar_asset.delete.mockRejectedValue(new Error('fk violation'));

      await expect(
        service.removeArAsset('asset-1', ACTING_DEVELOPER_AUTH_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(storageServiceMock.remove).not.toHaveBeenCalled();
      expect(prismaMock.audit_log.create).toHaveBeenCalledWith(
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
      prismaMock.ar_asset.findUnique.mockResolvedValue({ id: 'asset-1' });
      prismaMock.ar_asset.update.mockResolvedValue({ id: 'asset-1', isEnabled: true });
      prismaMock.audit_log.create.mockRejectedValue(new Error('audit table unreachable'));

      const result = await service.setArAssetEnabled('asset-1', true, ACTING_DEVELOPER_AUTH_ID);

      expect(result).toEqual({ id: 'asset-1', exhibitId: undefined, modelUrl: undefined, modelFormat: undefined, isEnabled: true });
    });

    it('does not throw, and skips the audit write, when the acting user has no matching user_account', async () => {
      prismaMock.user_account.findUnique.mockResolvedValue(null);
      prismaMock.ar_asset.findUnique.mockResolvedValue({ id: 'asset-1' });
      prismaMock.ar_asset.update.mockResolvedValue({ id: 'asset-1', is_enabled: true });

      const result = await service.setArAssetEnabled('asset-1', true, ACTING_DEVELOPER_AUTH_ID);

      expect(prismaMock.audit_log.create).not.toHaveBeenCalled();
      expect(result.isEnabled).toBe(true);
    });
  });
});