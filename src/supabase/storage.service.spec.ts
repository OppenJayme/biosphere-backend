import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  const ownerId = '550e8400-e29b-41d4-a716-446655440000';

  let service: StorageService;
  let uploadMock: ReturnType<typeof jest.fn>;
  let removeMock: ReturnType<typeof jest.fn>;
  let createSignedUrlMock: ReturnType<typeof jest.fn>;
  let fromMock: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    uploadMock = jest.fn((path: string) =>
      Promise.resolve({
        data: { path },
        error: null,
      }),
    );
    removeMock = jest.fn(() => Promise.resolve({ error: null }));
    createSignedUrlMock = jest.fn(() =>
      Promise.resolve({
        data: { signedUrl: 'https://signed.example/object' },
        error: null,
      }),
    );

    fromMock = jest.fn(() => ({
      upload: uploadMock,
      remove: removeMock,
      createSignedUrl: createSignedUrlMock,
    }));

    const supabase = {
      storage: {
        from: fromMock,
      },
    } as unknown as SupabaseClient;

    service = new StorageService(supabase);
  });

  it('uploads a valid JPEG using a generated safe path', async () => {
    const file = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

    const path = await service.upload(
      'specimen-media',
      ownerId,
      file,
      'image/jpeg',
    );

    expect(path).toMatch(new RegExp(`^${ownerId}/[0-9a-f-]{36}\\.jpg$`, 'i'));

    expect(fromMock).toHaveBeenCalledWith('specimen-media');

    expect(uploadMock).toHaveBeenCalledWith(path, file, {
      contentType: 'image/jpeg',
      upsert: false,
    });
  });

  it('uses a predictable avatar path', async () => {
    const file = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const path = await service.upload(
      'user-avatars',
      ownerId,
      file,
      'image/png',
    );

    expect(path).toBe(`${ownerId}/avatar.png`);
  });

  it('rejects unsupported MIME types', async () => {
    await expect(
      service.upload(
        'specimen-media',
        ownerId,
        Buffer.from('test'),
        'application/x-msdownload',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects files whose contents do not match the MIME type', async () => {
    await expect(
      service.upload(
        'specimen-media',
        ownerId,
        Buffer.from('not-a-real-jpeg'),
        'image/jpeg',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized files', async () => {
    const file = Buffer.alloc(5 * 1024 * 1024 + 1);

    await expect(
      service.upload('user-avatars', ownerId, file, 'image/jpeg'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an invalid owner UUID', async () => {
    const file = Buffer.from([0xff, 0xd8, 0xff, 0x00]);

    await expect(
      service.upload('specimen-media', 'not-a-uuid', file, 'image/jpeg'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps an empty upload provider response to a safe server error', async () => {
    uploadMock.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      service.upload(
        'specimen-media',
        ownerId,
        Buffer.from([0xff, 0xd8, 0xff, 0x00]),
        'image/jpeg',
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('removes an object from the selected private bucket', async () => {
    await expect(
      service.remove('specimen-media', `${ownerId}/image.jpg`),
    ).resolves.toBeUndefined();
    expect(fromMock).toHaveBeenCalledWith('specimen-media');
    expect(removeMock).toHaveBeenCalledWith([`${ownerId}/image.jpg`]);
  });

  it('maps a storage removal failure to a safe server error', async () => {
    removeMock.mockResolvedValueOnce({ error: { message: 'provider detail' } });

    await expect(
      service.remove('specimen-media', `${ownerId}/image.jpg`),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('creates a short-lived signed URL through the selected bucket', async () => {
    await expect(
      service.createSignedUrl('specimen-media', `${ownerId}/image.jpg`, 300),
    ).resolves.toBe('https://signed.example/object');
    expect(createSignedUrlMock).toHaveBeenCalledWith(
      `${ownerId}/image.jpg`,
      300,
    );
  });

  it('maps a signed-URL provider failure to a safe server error', async () => {
    createSignedUrlMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'provider detail' },
    });

    await expect(
      service.createSignedUrl('specimen-media', `${ownerId}/image.jpg`, 300),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('maps an empty signed-URL provider response to a safe server error', async () => {
    createSignedUrlMock.mockResolvedValueOnce({ data: null, error: null });

    await expect(
      service.createSignedUrl('specimen-media', `${ownerId}/image.jpg`, 300),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
