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
  modelFormat!: ArModelFormat;
  isEnabled!: boolean;
}

// An exhibit as the developer sees it when choosing where to deploy an AR
// asset: public identity and assets only, no curator content.
export class ArExhibitEntity {
  id!: string;
  publicSlug!: string;
  status!: string;
  // Archived exhibits are listed only while they still hold assets.
  archived!: boolean;
  // false for an exhibit that is listed only so its assets can be cleaned
  // up (archived, or its specimen is no longer approved for public display).
  // New assets cannot be deployed or moved to it.
  deployable!: boolean;
  commonName!: string | null;
  scientificName!: string | null;
  assets!: ArAssetEntity[];
}
