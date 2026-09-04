import type { ArModelFormat } from '../dto/create-ar-asset.dto';

// Mirrors database/sql/023_ar_asset.sql as amended by 023_ar_assetV2.sql
// (specimen_id dropped in favor of exhibit_id).
export class ArAssetEntity {
  id!: string;
  exhibitId!: string;
  // Storage path within the `ar-assets` bucket, not a public URL — the
  // bucket is private, so consumers must request a signed URL (that's the
  // `ar-assets`/exhibit-page module's responsibility, not this one).
  modelUrl!: string;
  modelFormat?: ArModelFormat | string;
  isEnabled?: boolean;
}