export type StorageBucket =
  | 'user-avatars'
  | 'specimen-media'
  | 'exhibit-media'
  | 'inquiry-attachments'
  | 'ar-assets';

interface StorageRule {
  maxBytes: number;
  mimeTypes: Record<string, string>;
}

export const STORAGE_RULES: Record<StorageBucket, StorageRule> = {
  'user-avatars': {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    },
  },

  'specimen-media': {
    maxBytes: 15 * 1024 * 1024,
    mimeTypes: {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    },
  },

  'exhibit-media': {
    maxBytes: 15 * 1024 * 1024,
    mimeTypes: {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    },
  },

  'inquiry-attachments': {
    maxBytes: 10 * 1024 * 1024,
    mimeTypes: {
      'application/pdf': 'pdf',
      'image/jpeg': 'jpg',
      'image/png': 'png',
    },
  },

  'ar-assets': {
    maxBytes: 50 * 1024 * 1024,
    mimeTypes: {
      'model/gltf-binary': 'glb',
      'model/vnd.usdz+zip': 'usdz',
    },
  },
};
