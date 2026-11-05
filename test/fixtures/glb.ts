/** Builds a binary glTF file around the given JSON chunk, for AR asset tests. */
export function glbBytes(
  json: unknown = { asset: { version: '2.0' } },
): Buffer {
  const encoded = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonLength = Math.ceil(encoded.length / 4) * 4;
  const total = 20 + jsonLength;
  const bytes = Buffer.alloc(total, 0x20);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(total, 8);
  bytes.writeUInt32LE(jsonLength, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  encoded.copy(bytes, 20);
  return bytes;
}
