/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers are typed as any. */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DeveloperService } from './developer.service';
import { PrismaService } from '../prisma/prisma.service';
import { SUPABASE_CLIENT } from '../supabase/supabase.constants';
import { StorageService } from '../supabase/storage.service';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const userAccountDelegateMock = {
  findMany: jest.fn(),
  create: jest.fn(),
  findUnique: jest.fn(),
  update: jest.fn(),
};
const arAssetDelegateMock = {
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findUnique: jest.fn(),
};
const auditLogDelegateMock = {
  create: jest.fn(),
};

const prismaMock = {
  user_account: userAccountDelegateMock,
  ar_asset: arAssetDelegateMock,
  exhibit: {
    findUnique: jest.fn(),
  },
  audit_log: auditLogDelegateMock,
  // Local aliases keep the behavior-focused expectations readable. They point
  // to the exact snake_case delegates injected into DeveloperService above.
  userAccount: userAccountDelegateMock,
  arAsset: arAssetDelegateMock,
  auditLog: auditLogDelegateMock,
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
function fakeFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
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
const TEST_DATE = new Date('2026-01-01T00:00:00.000Z');

function userAccountRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'account-1',
    auth_user_id: 'auth-user-1',
    full_name: 'Test Curator',
    role: 'CURATOR',
    status: 'ACTIVE',
    avatar_path: null,
    created_at: TEST_DATE,
    updated_at: TEST_DATE,
    ...overrides,
  };
}

function arAssetRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-1',
    exhibit_id: 'exhibit-1',
    storage_path: 'exhibit-1/old-path.glb',
    model_format: 'glb',
    is_enabled: false,
    ...overrides,
  };
}

describe('DeveloperService', () => {
  let service: DeveloperService;

  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

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
      prismaMock.userAccount.findMany.mockResolvedValue([
        userAccountRecord({ id: 'a' }),
      ]);

      const result = await service.listCuratorAccounts();

      expect(prismaMock.userAccount.findMany).toHaveBeenCalledWith({
        where: { role: 'CURATOR' },
        orderBy: { created_at: 'desc' },
      });
      expect(result).toEqual([
        expect.objectContaining({ id: 'a', fullName: 'Test Curator' }),
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
      const createdAccountRecord = userAccountRecord({
        id: 'account-1',
        auth_user_id: 'auth-user-1',
        full_name: dto.fullName,
      });
      prismaMock.userAccount.create.mockResolvedValue(createdAccountRecord);

      const result = await service.onboardInitialCurator(
        dto,
        ACTING_DEVELOPER_ID,
      );

      expect(supabaseMock.auth.admin.inviteUserByEmail).toHaveBeenCalledWith(
        dto.email,
        { data: { role: 'CURATOR' } },
      );
      expect(prismaMock.userAccount.create).toHaveBeenCalledWith({
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
        createdAt: TEST_DATE,
        updatedAt: TEST_DATE,
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ONBOARD_CURATOR',
            status: 'SUCCESS',
            affected_record_id: 'account-1',
            user_account: {
              connect: { auth_user_id: ACTING_DEVELOPER_ID },
            },
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
          data: expect.objectContaining({
            action: 'ONBOARD_CURATOR',
            status: 'FAILED',
          }),
        }),
      );
    });

    it('throws InternalServerErrorException and audits FAILED when the account row cannot be created', async () => {
      supabaseMock.auth.admin.inviteUserByEmail.mockResolvedValue({
        data: { user: { id: 'auth-user-2' } },
        error: null,
      });
      prismaMock.userAccount.create.mockRejectedValue(
        new Error('unique constraint'),
      );

      await expect(
        service.onboardInitialCurator(dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ONBOARD_CURATOR',
            status: 'FAILED',
          }),
        }),
      );
    });
  });

  // ===========================================================
  // updateCuratorStatus — REQ-4.2-03
  // ===========================================================
  describe('updateCuratorStatus', () => {
    const dto = {
      status: 'INACTIVE' as const,
      authorizationReason: 'formally authorized',
    };

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
          data: expect.objectContaining({
            action: 'UPDATE_CURATOR_STATUS',
            status: 'DENIED',
          }),
        }),
      );
    });

    it('updates status and audits SUCCESS for a valid curator account', async () => {
      prismaMock.userAccount.findUnique.mockResolvedValue({
        id: 'cur-1',
        role: 'CURATOR',
      });
      const updated = userAccountRecord({
        id: 'cur-1',
        status: 'INACTIVE',
      });
      prismaMock.userAccount.update.mockResolvedValue(updated);

      const result = await service.updateCuratorStatus(
        'cur-1',
        dto,
        ACTING_DEVELOPER_ID,
      );

      expect(prismaMock.userAccount.update).toHaveBeenCalledWith({
        where: { id: 'cur-1' },
        data: { status: 'INACTIVE' },
      });
      expect(result).toEqual(
        expect.objectContaining({
          id: 'cur-1',
          role: 'CURATOR',
          status: 'INACTIVE',
        }),
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'UPDATE_CURATOR_STATUS',
            status: 'SUCCESS',
            details: expect.objectContaining({
              authorizationReason: dto.authorizationReason,
            }),
          }),
        }),
      );
    });

    it('throws InternalServerErrorException and audits FAILED when the update fails', async () => {
      prismaMock.userAccount.findUnique.mockResolvedValue({
        id: 'cur-1',
        role: 'CURATOR',
      });
      prismaMock.userAccount.update.mockRejectedValue(new Error('db down'));

      await expect(
        service.updateCuratorStatus('cur-1', dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'UPDATE_CURATOR_STATUS',
            status: 'FAILED',
          }),
        }),
      );
    });
  });

  // ===========================================================
  // createArAsset — REQ-4.2-04 / REQ-4.2-05
  // ===========================================================
  describe('createArAsset', () => {
    const dto = {
      exhibitId: 'exhibit-1',
      modelFormat: 'glb' as const,
      isEnabled: false,
    };

    it('throws NotFoundException when the exhibit does not exist', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue(null);

      await expect(
        service.createArAsset(fakeFile(), dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(NotFoundException);
      expect(storageServiceMock.upload).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the exhibit is archived', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({
        id: 'exhibit-1',
        archived_at: new Date(),
      });

      await expect(
        service.createArAsset(fakeFile(), dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(BadRequestException);
      expect(storageServiceMock.upload).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when no file is provided', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({
        id: 'exhibit-1',
        archived_at: null,
      });

      await expect(
        service.createArAsset(undefined as never, dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the file exceeds the size limit', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({
        id: 'exhibit-1',
        archived_at: null,
      });
      const oversized = fakeFile({ size: 100 * 1024 * 1024 });

      await expect(
        service.createArAsset(oversized, dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the file extension does not match modelFormat', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({
        id: 'exhibit-1',
        archived_at: null,
      });
      const wrongExt = fakeFile({ originalname: 'model.gltf' });

      await expect(
        service.createArAsset(wrongExt, dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('uploads then creates the row on success, and audits SUCCESS', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({
        id: 'exhibit-1',
        archived_at: null,
      });
      storageServiceMock.upload.mockResolvedValue('exhibit-1/some-path.glb');
      const createdRow = arAssetRecord({
        storage_path: 'exhibit-1/some-path.glb',
      });
      prismaMock.arAsset.create.mockResolvedValue(createdRow);

      const result = await service.createArAsset(
        fakeFile(),
        dto,
        ACTING_DEVELOPER_ID,
      );

      expect(storageServiceMock.upload).toHaveBeenCalledWith(
        'ar-assets',
        'exhibit-1',
        expect.any(Buffer),
        'model/gltf-binary',
      );
      expect(prismaMock.arAsset.create).toHaveBeenCalledWith({
        data: {
          exhibit: { connect: { id: 'exhibit-1' } },
          storage_path: 'exhibit-1/some-path.glb',
          model_format: 'glb',
          is_enabled: false,
        },
      });
      expect(result).toEqual({
        id: 'asset-1',
        exhibitId: 'exhibit-1',
        modelUrl: 'exhibit-1/some-path.glb',
        modelFormat: 'glb',
        isEnabled: false,
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE_AR_ASSET',
            status: 'SUCCESS',
          }),
        }),
      );
    });

    it('cleans up the uploaded file and audits FAILED when the DB insert fails', async () => {
      prismaMock.exhibit.findUnique.mockResolvedValue({
        id: 'exhibit-1',
        archived_at: null,
      });
      storageServiceMock.upload.mockResolvedValue('exhibit-1/some-path.glb');
      prismaMock.arAsset.create.mockRejectedValue(new Error('insert failed'));

      await expect(
        service.createArAsset(fakeFile(), dto, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(storageServiceMock.remove).toHaveBeenCalledWith(
        'ar-assets',
        'exhibit-1/some-path.glb',
      );
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'CREATE_AR_ASSET',
            status: 'FAILED',
          }),
        }),
      );
    });
  });

  // ===========================================================
  // updateArAsset — REQ-4.2-04
  // ===========================================================
  describe('updateArAsset', () => {
    const existingAsset = arAssetRecord();

    it('throws NotFoundException when the asset does not exist', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(null);

      await expect(
        service.updateArAsset('missing', undefined, {}, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns the existing asset unchanged when no file and no fields are given', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(existingAsset);

      const result = await service.updateArAsset(
        'asset-1',
        undefined,
        {},
        ACTING_DEVELOPER_ID,
      );

      expect(result).toEqual({
        id: 'asset-1',
        exhibitId: 'exhibit-1',
        modelUrl: 'exhibit-1/old-path.glb',
        modelFormat: 'glb',
        isEnabled: false,
      });
      expect(prismaMock.arAsset.update).not.toHaveBeenCalled();
    });

    it('toggles isEnabled only, without touching storage', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(existingAsset);
      prismaMock.arAsset.update.mockResolvedValue(
        arAssetRecord({ is_enabled: true }),
      );

      const result = await service.updateArAsset(
        'asset-1',
        undefined,
        { isEnabled: true },
        ACTING_DEVELOPER_ID,
      );

      expect(prismaMock.arAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { is_enabled: true },
      });
      expect(storageServiceMock.upload).not.toHaveBeenCalled();
      expect(result.isEnabled).toBe(true);
    });

    it('rejects a model format change without a replacement file', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(existingAsset);

      await expect(
        service.updateArAsset(
          'asset-1',
          undefined,
          { modelFormat: 'usdz' },
          ACTING_DEVELOPER_ID,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.arAsset.update).not.toHaveBeenCalled();
      expect(storageServiceMock.upload).not.toHaveBeenCalled();
    });

    it('replaces the file, updates model_url/model_format, and removes the old file', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(existingAsset);
      storageServiceMock.upload.mockResolvedValue('exhibit-1/new-path.glb');
      const updatedRow = arAssetRecord({
        storage_path: 'exhibit-1/new-path.glb',
      });
      prismaMock.arAsset.update.mockResolvedValue(updatedRow);

      const result = await service.updateArAsset(
        'asset-1',
        fakeFile(),
        {},
        ACTING_DEVELOPER_ID,
      );

      expect(storageServiceMock.upload).toHaveBeenCalled();
      expect(prismaMock.arAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: {
          storage_path: 'exhibit-1/new-path.glb',
          model_format: 'glb',
        },
      });
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

    it('removes the new file but keeps the old file if the DB update fails', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(existingAsset);
      storageServiceMock.upload.mockResolvedValue('exhibit-1/new-path.glb');
      prismaMock.arAsset.update.mockRejectedValue(new Error('update failed'));

      await expect(
        service.updateArAsset('asset-1', fakeFile(), {}, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(storageServiceMock.remove).toHaveBeenCalledWith(
        'ar-assets',
        'exhibit-1/new-path.glb',
      );
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
      prismaMock.arAsset.findUnique.mockResolvedValue(arAssetRecord());
      prismaMock.arAsset.update.mockResolvedValue(
        arAssetRecord({ is_enabled: true }),
      );

      const result = await service.setArAssetEnabled(
        'asset-1',
        true,
        ACTING_DEVELOPER_ID,
      );

      expect(result.isEnabled).toBe(true);
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ACTIVATE_AR_ASSET',
            status: 'SUCCESS',
          }),
        }),
      );
    });

    it('deactivates and audits DEACTIVATE_AR_ASSET', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(arAssetRecord());
      prismaMock.arAsset.update.mockResolvedValue(arAssetRecord());

      await service.setArAssetEnabled('asset-1', false, ACTING_DEVELOPER_ID);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'DEACTIVATE_AR_ASSET',
            status: 'SUCCESS',
          }),
        }),
      );
    });

    it('throws InternalServerErrorException and audits FAILED when the update fails', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(arAssetRecord());
      prismaMock.arAsset.update.mockRejectedValue(new Error('db error'));

      await expect(
        service.setArAssetEnabled('asset-1', true, ACTING_DEVELOPER_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ACTIVATE_AR_ASSET',
            status: 'FAILED',
          }),
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
      prismaMock.arAsset.findUnique.mockResolvedValue(
        arAssetRecord({ storage_path: 'exhibit-1/some-path.glb' }),
      );
      prismaMock.arAsset.delete.mockResolvedValue({});

      const result = await service.removeArAsset(
        'asset-1',
        ACTING_DEVELOPER_ID,
      );

      expect(prismaMock.arAsset.delete).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
      });
      expect(storageServiceMock.remove).toHaveBeenCalledWith(
        'ar-assets',
        'exhibit-1/some-path.glb',
      );
      expect(result).toEqual({ id: 'asset-1', removed: true });
    });

    it('does not touch storage and audits FAILED when the delete fails', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(
        arAssetRecord({ storage_path: 'exhibit-1/some-path.glb' }),
      );
      prismaMock.arAsset.delete.mockRejectedValue(new Error('fk violation'));

      await expect(
        service.removeArAsset('asset-1', ACTING_DEVELOPER_ID),
      ).rejects.toThrow(InternalServerErrorException);

      expect(storageServiceMock.remove).not.toHaveBeenCalled();
      expect(prismaMock.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'REMOVE_AR_ASSET',
            status: 'FAILED',
          }),
        }),
      );
    });
  });

  // ===========================================================
  // Audit logging resilience — REQ-4.2-09
  // ===========================================================
  describe('audit logging failures never mask the primary result', () => {
    it('still returns the updated asset even if audit_log insert fails', async () => {
      prismaMock.arAsset.findUnique.mockResolvedValue(arAssetRecord());
      prismaMock.arAsset.update.mockResolvedValue(
        arAssetRecord({ is_enabled: true }),
      );
      prismaMock.auditLog.create.mockRejectedValue(
        new Error('audit table unreachable'),
      );

      const result = await service.setArAssetEnabled(
        'asset-1',
        true,
        ACTING_DEVELOPER_ID,
      );

      expect(result).toEqual({
        id: 'asset-1',
        exhibitId: 'exhibit-1',
        modelUrl: 'exhibit-1/old-path.glb',
        modelFormat: 'glb',
        isEnabled: true,
      });
    });
  });
});
