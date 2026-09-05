import { Test, TestingModule } from '@nestjs/testing';
import { DeveloperController } from './developer.controller';
import { DeveloperService } from './developer.service';
import type { AuthenticatedUser } from '../auth/types/auth.types';

// NOTE: calling controller methods directly (as this file does) bypasses
// Nest's HTTP pipeline — guards, the ValidationPipe, and FileInterceptor
// never run here. That's intentional: this file only proves the controller
// wires params through to the service correctly. Role enforcement,
// multipart parsing, and file-size limits are covered by
// test/developer.e2e-spec.ts instead.

const developerServiceMock = {
  listCuratorAccounts: jest.fn(),
  onboardInitialCurator: jest.fn(),
  updateCuratorStatus: jest.fn(),
  createArAsset: jest.fn(),
  updateArAsset: jest.fn(),
  setArAssetEnabled: jest.fn(),
  removeArAsset: jest.fn(),
};

const currentUser: AuthenticatedUser = {
  id: 'dev-uuid-1',
  email: 'developer@example.com',
  role: 'DEVELOPER',
};

describe('DeveloperController', () => {
  let controller: DeveloperController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DeveloperController],
      providers: [
        { provide: DeveloperService, useValue: developerServiceMock },
      ],
    }).compile();

    controller = module.get<DeveloperController>(DeveloperController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('listCurators delegates to the service', async () => {
    developerServiceMock.listCuratorAccounts.mockResolvedValue([{ id: 'a' }]);

    const result = await controller.listCurators();

    expect(developerServiceMock.listCuratorAccounts).toHaveBeenCalledWith();
    expect(result).toEqual([{ id: 'a' }]);
  });

  it('onboardInitialCurator passes the DTO and acting user id', async () => {
    const dto = { email: 'new@example.com', fullName: 'New Curator' };
    developerServiceMock.onboardInitialCurator.mockResolvedValue({
      id: 'account-1',
    });

    const result = await controller.onboardInitialCurator(dto, currentUser);

    expect(developerServiceMock.onboardInitialCurator).toHaveBeenCalledWith(
      dto,
      currentUser.id,
    );
    expect(result).toEqual({ id: 'account-1' });
  });

  it('updateCuratorStatus passes id, DTO, and acting user id', async () => {
    const dto = { status: 'INACTIVE' as const, authorizationReason: 'test' };
    developerServiceMock.updateCuratorStatus.mockResolvedValue({ id: 'cur-1' });

    const result = await controller.updateCuratorStatus(
      'cur-1',
      dto,
      currentUser,
    );

    expect(developerServiceMock.updateCuratorStatus).toHaveBeenCalledWith(
      'cur-1',
      dto,
      currentUser.id,
    );
    expect(result).toEqual({ id: 'cur-1' });
  });

  it('createArAsset passes the file, DTO, and acting user id', async () => {
    const file = { originalname: 'model.glb' } as Express.Multer.File;
    const dto = { exhibitId: 'exhibit-1', modelFormat: 'glb' as const };
    developerServiceMock.createArAsset.mockResolvedValue({ id: 'asset-1' });

    const result = await controller.createArAsset(file, dto, currentUser);

    expect(developerServiceMock.createArAsset).toHaveBeenCalledWith(
      file,
      dto,
      currentUser.id,
    );
    expect(result).toEqual({ id: 'asset-1' });
  });

  it('updateArAsset passes id, optional file, DTO, and acting user id', async () => {
    developerServiceMock.updateArAsset.mockResolvedValue({ id: 'asset-1' });

    const result = await controller.updateArAsset(
      'asset-1',
      undefined,
      { isEnabled: true },
      currentUser,
    );

    expect(developerServiceMock.updateArAsset).toHaveBeenCalledWith(
      'asset-1',
      undefined,
      { isEnabled: true },
      currentUser.id,
    );
    expect(result).toEqual({ id: 'asset-1' });
  });

  it('activateArAsset calls setArAssetEnabled(id, true, userId)', async () => {
    developerServiceMock.setArAssetEnabled.mockResolvedValue({
      id: 'asset-1',
      isEnabled: true,
    });

    const result = await controller.activateArAsset('asset-1', currentUser);

    expect(developerServiceMock.setArAssetEnabled).toHaveBeenCalledWith(
      'asset-1',
      true,
      currentUser.id,
    );
    expect(result.isEnabled).toBe(true);
  });

  it('deactivateArAsset calls setArAssetEnabled(id, false, userId)', async () => {
    developerServiceMock.setArAssetEnabled.mockResolvedValue({
      id: 'asset-1',
      isEnabled: false,
    });

    const result = await controller.deactivateArAsset('asset-1', currentUser);

    expect(developerServiceMock.setArAssetEnabled).toHaveBeenCalledWith(
      'asset-1',
      false,
      currentUser.id,
    );
    expect(result.isEnabled).toBe(false);
  });

  it('removeArAsset delegates to the service', async () => {
    developerServiceMock.removeArAsset.mockResolvedValue({
      id: 'asset-1',
      removed: true,
    });

    const result = await controller.removeArAsset('asset-1', currentUser);

    expect(developerServiceMock.removeArAsset).toHaveBeenCalledWith(
      'asset-1',
      currentUser.id,
    );
    expect(result).toEqual({ id: 'asset-1', removed: true });
  });
});
