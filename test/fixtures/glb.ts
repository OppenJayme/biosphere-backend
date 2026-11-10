/**
 * Builds a binary glTF file around the given JSON chunk, for AR asset tests.
 * When `bin` is given it is appended as the BIN chunk (padded to 4 bytes).
 */
export function glbBytes(
  json: unknown = { asset: { version: '2.0' } },
  bin?: Uint8Array,
): Buffer {
  const encoded = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonLength = Math.ceil(encoded.length / 4) * 4;
  const binLength = bin ? Math.ceil(bin.length / 4) * 4 : 0;
  const total = 20 + jsonLength + (bin ? 8 + binLength : 0);
  const bytes = Buffer.alloc(total, 0x20);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(total, 8);
  bytes.writeUInt32LE(jsonLength, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(bytes, 20);
  if (bin) {
    const binHeader = 20 + jsonLength;
    bytes.writeUInt32LE(binLength, binHeader);
    bytes.writeUInt32LE(0x004e4942, binHeader + 4);
    bytes.fill(0, binHeader + 8);
    Buffer.from(bin).copy(bytes, binHeader + 8);
  }
  return bytes;
}

/** The first 24 bytes of a PNG: signature and IHDR with the given size. */
export function pngHeader(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.writeUInt32BE(0x0d0a1a0a, 4);
  bytes.writeUInt32BE(13, 8);
  bytes.writeUInt32BE(0x49484452, 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

/** A JPEG start with an APP0 segment followed by a baseline frame header. */
export function jpegHeader(width: number, height: number): Buffer {
  return Buffer.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
  ]);
}

/** A self-contained GLB with one texture whose bytes live in the BIN chunk. */
export function texturedGlb(image: Buffer, extra: object = {}): Buffer {
  return glbBytes(
    {
      asset: { version: '2.0' },
      buffers: [{ byteLength: image.length }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: image.length }],
      images: [
        {
          bufferView: 0,
          mimeType: image[0] === 0xff ? 'image/jpeg' : 'image/png',
        },
      ],
      ...extra,
    },
    image,
  );
}
