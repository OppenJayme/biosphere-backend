import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from './qr.service';

const exhibitDelegate = { findUnique: jest.fn() };
const auditDelegate = { create: jest.fn() };
const prismaMock = {
  exhibit: exhibitDelegate,
  audit_log: auditDelegate,
};

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const EXHIBIT_ID = '22222222-2222-4222-8222-222222222222';
const FRONTEND_URL = 'https://biosphere.example';

function exhibitRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: EXHIBIT_ID,
    public_slug: 'six-legged-carabao',
    status: 'PUBLISHED',
    archived_at: null,
    ...overrides,
  };
}

describe('QrService', () => {
  let service: QrService;
  let configServiceMock: { get: jest.Mock; getOrThrow: jest.Mock };

  beforeEach(async () => {
    jest.resetAllMocks();
    exhibitDelegate.findUnique.mockResolvedValue(exhibitRecord());
    auditDelegate.create.mockResolvedValue({});
    configServiceMock = {
      get: jest.fn().mockReturnValue(undefined),
      getOrThrow: jest.fn().mockReturnValue(FRONTEND_URL),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QrService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compile();

    service = module.get<QrService>(QrService);
  });

  it('builds the public URL from the exhibit slug and frontend URL', async () => {
    const result = await service.getInfo(EXHIBIT_ID);

    expect(result).toEqual({
      exhibitId: EXHIBIT_ID,
      publicSlug: 'six-legged-carabao',
      publicUrl: `${FRONTEND_URL}/exhibits/six-legged-carabao`,
    });
  });

  it('prefers an explicit QR_EXHIBIT_BASE_URL over FRONTEND_URL', async () => {
    configServiceMock.get.mockReturnValue('https://qr.biosphere.example/');

    const result = await service.getInfo(EXHIBIT_ID);

    expect(result.publicUrl).toBe(
      'https://qr.biosphere.example/exhibits/six-legged-carabao',
    );
    expect(configServiceMock.getOrThrow).not.toHaveBeenCalled();
  });

  it('throws not found for an unknown exhibit', async () => {
    exhibitDelegate.findUnique.mockResolvedValue(null);

    await expect(service.getInfo(EXHIBIT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('rejects QR generation for an unpublished exhibit', async () => {
    exhibitDelegate.findUnique.mockResolvedValue(
      exhibitRecord({ status: 'UNPUBLISHED' }),
    );

    await expect(service.getInfo(EXHIBIT_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('rejects generating a QR code for an archived exhibit', async () => {
    exhibitDelegate.findUnique.mockResolvedValue(
      exhibitRecord({ archived_at: new Date('2026-01-01T00:00:00.000Z') }),
    );

    await expect(service.generatePng(EXHIBIT_ID, ACCOUNT_ID)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.generateSvg(EXHIBIT_ID, ACCOUNT_ID)).rejects.toThrow(
      BadRequestException,
    );
    expect(auditDelegate.create).not.toHaveBeenCalled();
  });

  it('generates a PNG buffer and records an audit entry', async () => {
    const buffer = await service.generatePng(EXHIBIT_ID, ACCOUNT_ID);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: ACCOUNT_ID,
        affected_record_id: EXHIBIT_ID,
        affected_record_type: 'exhibit',
        action: 'GENERATE_EXHIBIT_QR',
        module: 'qr_exhibit',
        details: { format: 'PNG' },
        status: 'SUCCESS',
      }),
    });
  });

  it('generates an SVG string and records an audit entry', async () => {
    const svg = await service.generateSvg(EXHIBIT_ID, ACCOUNT_ID);

    expect(svg).toContain('<svg');
    expect(auditDelegate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'GENERATE_EXHIBIT_QR',
        details: { format: 'SVG' },
      }),
    });
  });

  it('propagates NotFoundException from generatePng/generateSvg for a missing exhibit', async () => {
    exhibitDelegate.findUnique.mockResolvedValue(null);

    await expect(service.generatePng(EXHIBIT_ID, ACCOUNT_ID)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.generateSvg(EXHIBIT_ID, ACCOUNT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});
