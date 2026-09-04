import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_CLIENT } from './supabase.constants';
import { STORAGE_RULES, type StorageBucket } from './storage.config';

@Injectable()
export class StorageService {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  private validateFile(
    bucket: StorageBucket,
    file: Buffer,
    mimeType: string,
  ): string {
    const rule = STORAGE_RULES[bucket];

    if (file.length === 0) {
      throw new BadRequestException('File cannot be empty');
    }

    if (file.length > rule.maxBytes) {
      throw new BadRequestException(
        `File exceeds the maximum size allowed for ${bucket}`,
      );
    }

    const extension = rule.mimeTypes[mimeType];

    if (!extension) {
      throw new BadRequestException(`Unsupported file type for ${bucket}`);
    }

    if (!this.hasValidFileSignature(file, mimeType)) {
      throw new BadRequestException(
        'File content does not match the declared file type',
      );
    }

    return extension;
  }

  private hasValidFileSignature(file: Buffer, mimeType: string): boolean {
    switch (mimeType) {
      case 'image/jpeg':
        return (
          file.length >= 3 &&
          file[0] === 0xff &&
          file[1] === 0xd8 &&
          file[2] === 0xff
        );

      case 'image/png':
        return (
          file.length >= 8 &&
          file
            .subarray(0, 8)
            .equals(
              Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
            )
        );

      case 'image/webp':
        return (
          file.length >= 12 &&
          file.subarray(0, 4).toString('ascii') === 'RIFF' &&
          file.subarray(8, 12).toString('ascii') === 'WEBP'
        );

      case 'application/pdf':
        return file
          .subarray(0, Math.min(file.length, 1024))
          .includes(Buffer.from('%PDF-'));

      case 'model/gltf-binary':
        return (
          file.length >= 4 && file.subarray(0, 4).toString('ascii') === 'glTF'
        );

      case 'model/vnd.usdz+zip':
        return (
          file.length >= 4 &&
          file[0] === 0x50 &&
          file[1] === 0x4b &&
          ((file[2] === 0x03 && file[3] === 0x04) ||
            (file[2] === 0x05 && file[3] === 0x06) ||
            (file[2] === 0x07 && file[3] === 0x08))
        );

      default:
        return false;
    }
  }

  private buildObjectPath(
    bucket: StorageBucket,
    ownerId: string,
    extension: string,
  ): string {
    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!uuidPattern.test(ownerId)) {
      throw new BadRequestException('Invalid storage owner ID');
    }

    if (bucket === 'user-avatars') {
      return `${ownerId}/avatar.${extension}`;
    }

    return `${ownerId}/${randomUUID()}.${extension}`;
  }

  async upload(
    bucket: StorageBucket,
    ownerId: string,
    file: Buffer,
    mimeType: string,
  ): Promise<string> {
    const extension = this.validateFile(bucket, file, mimeType);

    const path = this.buildObjectPath(bucket, ownerId, extension);

    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(path, file, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      throw new InternalServerErrorException(
        `Failed to upload file to ${bucket}`,
      );
    }

    return data.path;
  }

  async remove(bucket: StorageBucket, path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(bucket).remove([path]);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to remove file from ${bucket}`,
      );
    }
  }

  async createSignedUrl(
    bucket: StorageBucket,
    path: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to create signed URL for ${bucket}`,
      );
    }

    return data.signedUrl;
  }
}
