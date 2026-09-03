import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { StorageService } from './storage.service';

describe('StorageService', () => {
  const ownerId = '550e8400-e29b-41d4-a716-446655440000';

  let service: StorageService;
  let uploadMock: ReturnType<typeof jest.fn>;
  let fromMock: ReturnType<typeof jest.fn>;

  beforeEach(() => {
    uploadMock = jest.fn((path: string) =>
      Promise.resolve({
        data: { path },
        error: null,
      }),
    );

    fromMock = jest.fn(() => ({
      upload: uploadMock,
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
});
