/**
 * Structure check for binary glTF (.glb) AR models (REQ-4.2-05). Only
 * self-contained models are accepted: a `uri` pointing at another file or
 * host would make every visitor's browser request it. The frontend runs the
 * same check for early feedback (src/features/developer/glb.ts), but this one
 * is the enforcement.
 */

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_JSON_CHUNK = 0x4e4f534a; // "JSON"
const GLB_HEADER_BYTES = 20; // 12-byte file header + 8-byte first chunk header

export const INVALID_GLB = 'This file is not a valid binary glTF (.glb) model.';
export const EXTERNAL_GLB_REFERENCES =
  'This model references external files or URLs. Embed its buffers and textures in the .glb before uploading.';

/** Every `uri` in the glTF JSON that is not an embedded data: URI. */
export function externalGltfReferences(json: unknown): string[] {
  const found: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value)) {
        const embedded =
          typeof child === 'string' &&
          child.trim().toLowerCase().startsWith('data:');
        if (key === 'uri' && !embedded) {
          found.push(String(child));
        } else {
          visit(child);
        }
      }
    }
  };
  visit(json);
  return found;
}

/** Returns the rejection message for a GLB, or undefined when it is valid. */
export function glbFileError(file: Buffer): string | undefined {
  if (file.length < GLB_HEADER_BYTES) return INVALID_GLB;

  const declaredLength = file.readUInt32LE(8);
  const jsonLength = file.readUInt32LE(12);
  if (
    file.readUInt32LE(0) !== GLB_MAGIC ||
    file.readUInt32LE(4) !== 2 ||
    declaredLength > file.length ||
    file.readUInt32LE(16) !== GLB_JSON_CHUNK ||
    GLB_HEADER_BYTES + jsonLength > declaredLength
  ) {
    return INVALID_GLB;
  }

  try {
    const json: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        file.subarray(GLB_HEADER_BYTES, GLB_HEADER_BYTES + jsonLength),
      ),
    );
    return externalGltfReferences(json).length > 0
      ? EXTERNAL_GLB_REFERENCES
      : undefined;
  } catch {
    // Bad UTF-8, bad JSON, or nesting too deep to walk.
    return INVALID_GLB;
  }
}
