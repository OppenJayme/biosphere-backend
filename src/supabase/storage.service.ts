import {
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase-client.provider';

export type StorageBucket =
  | 'user-avatars'
  | 'specimen-media'
  | 'exhibit-media'
  | 'inquiry-attachments'
  | 'ar-assets';

@Injectable()
export class StorageService {
  constructor(
    @Inject(SUPABASE_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

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
