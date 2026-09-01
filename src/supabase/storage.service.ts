import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SupabaseClient } from '@supabase/supabase-js';

import { SUPABASE_CLIENT } from './supabase-client.provider';
import { STORAGE_RULES, type StorageBucket } from './storage.config';

@Injectable()
export class StorageService {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  validateFile(bucket: StorageBucket, size: number, mimeType: string): string {
    const rule = STORAGE_RULES[bucket];

    if (size <= 0) {
      throw new BadRequestException('File cannot be empty');
    }

    if (size > rule.maxBytes) {
      throw new BadRequestException(
        `File exceeds the maximum size allowed for ${bucket}`,
      );
    }

    const extension = rule.mimeTypes[mimeType];

    if (!extension) {
      throw new BadRequestException(`Unsupported file type for ${bucket}`);
    }

    return extension;
  }

  buildObjectPath(
    bucket: StorageBucket,
    ownerId: string,
    extension: string,
  ): string {
    if (!/^[0-9a-f-]{36}$/i.test(ownerId)) {
      throw new BadRequestException('Invalid storage owner ID');
    }

    if (bucket === 'user-avatars') {
      return `${ownerId}/avatar.${extension}`;
    }

    return `${ownerId}/${randomUUID()}.${extension}`;
  }

  async upload(
    bucket: StorageBucket,
    path: string,
    file: Buffer,
    contentType: string,
  ): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(path, file, {
        contentType,
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
