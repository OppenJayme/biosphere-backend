import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NextFunction, Response } from 'express';
import type { Server } from 'node:http';
import request from 'supertest';
import type { AuthenticatedRequest } from '../auth/types/auth.types';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';

const EXHIBIT_ID = '44444444-4444-4444-8444-444444444444';
const PNG_BYTES = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const qrServiceMock = { generatePng: jest.fn() };

describe('QrController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [QrController],
      providers: [{ provide: QrService, useValue: qrServiceMock }],
    }).compile();

    app = module.createNestApplication();
    app.use((req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      req.user = {
        id: 'user-id',
        accountId: 'account-id',
        email: 'curator@example.test',
        role: 'CURATOR',
      };
      next();
    });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    qrServiceMock.generatePng.mockResolvedValue(PNG_BYTES);
  });

  it('sends PNG bytes instead of a JSON Buffer object', async () => {
    const server = app.getHttpServer() as Server;
    const response = await request(server)
      .get(`/exhibits/${EXHIBIT_ID}/qr/png`)
      .buffer(true)
      .parse((res, callback: (error: Error | null, body?: Buffer) => void) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^image\/png(?:;|$)/);
    const responseBody = response.body as Buffer;
    expect(responseBody.subarray(0, PNG_BYTES.length)).toEqual(PNG_BYTES);
    expect(response.headers['content-disposition']).toContain('.png');
  });
});
