/**
 * Structure, compatibility and metadata check for binary glTF (.glb) AR models
 * (REQ-4.2-05). This is the enforcement; the frontend runs the same rules for
 * early feedback (src/features/developer/glb.ts) and must be kept in step.
 *
 * - Only self-contained models are accepted: a `uri` pointing at another file
 *   or host would make every visitor's browser request it.
 * - Compatibility follows Google's Scene Viewer file requirements
 *   (developers.google.com/ar/develop/scene-viewer), because Android visitors
 *   without WebXR fall back to Scene Viewer. Hard limits reject the file;
 *   recommended limits only produce warnings.
 * - Compressed geometry/textures (Draco, meshopt, KTX2, WebP) are rejected:
 *   Google does not list them as supported by Scene Viewer (decision 7 Nov).
 */

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_JSON_CHUNK = 0x4e4f534a; // "JSON"
const GLB_BIN_CHUNK = 0x004e4942; // "BIN\0"
const GLB_HEADER_BYTES = 20; // 12-byte file header + 8-byte first chunk header

const MB = 1024 * 1024;
/** Scene Viewer's maximum; USDZ files keep the general 50 MB limit. */
export const MAX_GLB_SIZE_BYTES = 15 * MB;
export const RECOMMENDED_GLB_SIZE_BYTES = 10 * MB;
export const MAX_TEXTURE_SIZE = 2048;
export const MAX_SKIN_JOINTS = 254;
export const RECOMMENDED_MAX_TRIANGLES = 100_000;
export const RECOMMENDED_MAX_MATERIALS = 10;

/** Extensions Scene Viewer documents as supported. */
export const SCENE_VIEWER_EXTENSIONS: readonly string[] = [
  'KHR_materials_unlit',
  'KHR_texture_transform',
  'KHR_materials_pbrSpecularGlossiness',
];
export const COMPRESSION_EXTENSIONS: readonly string[] = [
  'KHR_draco_mesh_compression',
  'EXT_meshopt_compression',
  'KHR_meshopt_compression',
  'KHR_texture_basisu',
  'EXT_texture_webp',
  'EXT_texture_avif',
];

export const INVALID_GLB = 'This file is not a valid binary glTF (.glb) model.';
export const EXTERNAL_GLB_REFERENCES =
  'This model references external files or URLs. Embed its buffers and textures in the .glb before uploading.';
export const GLB_TOO_LARGE =
  'GLB models must be 15 MB or smaller so Android Scene Viewer can open them.';
export const MORPH_TARGETS_USED =
  'This model uses morph targets (blend shapes), which Android Scene Viewer does not support.';
export const VERTEX_COLORS_USED =
  'This model uses vertex colors, which Android Scene Viewer does not support. Bake them into a texture.';
export const UNSUPPORTED_PRIMITIVE_MODE =
  'This model contains points or lines. Android Scene Viewer only shows triangle meshes.';
export const TOO_MANY_UV_SETS =
  'A mesh in this model has more than one UV set. Android Scene Viewer supports one.';
export const TOO_MANY_JOINTS = `A skin in this model has more than ${MAX_SKIN_JOINTS} bones, the Android Scene Viewer limit.`;
export const TOO_MANY_BONE_WEIGHTS =
  'A mesh in this model has more than 4 bone weights per vertex, the Android Scene Viewer limit.';
export const UNSUPPORTED_TEXTURE_FORMAT =
  'Textures must be PNG or JPEG images.';
export const UNREADABLE_TEXTURE = 'A texture in this model could not be read.';

export const compressionMessage = (extension: string) =>
  `This model uses ${extension} (compressed geometry or textures), which Android Scene Viewer cannot open. Export it without compression.`;
export const requiredExtensionMessage = (extension: string) =>
  `This model requires the ${extension} glTF extension, which Android Scene Viewer does not support.`;
export const textureTooLargeMessage = (width: number, height: number) =>
  `A texture in this model is ${width}×${height}. Android Scene Viewer allows at most ${MAX_TEXTURE_SIZE}×${MAX_TEXTURE_SIZE}.`;

/** Facts about an accepted model, recorded in the deployment audit entry. */
export type GlbMetadata = {
  sizeBytes: number;
  meshCount: number;
  triangleCount: number;
  materialCount: number;
  textureCount: number;
  largestTexture: { width: number; height: number } | null;
  animationCount: number;
  extensionsUsed: string[];
};

export type GlbInspection =
  | { error: string }
  | { error?: undefined; metadata: GlbMetadata; warnings: string[] };

type Json = Record<string, unknown>;

const asObject = (value: unknown): Json | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Json)
    : undefined;
const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];
const asIndex = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
const asStrings = (value: unknown): string[] =>
  asArray(value).filter((item): item is string => typeof item === 'string');

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

function decodeDataUri(uri: string): Uint8Array | undefined {
  const comma = uri.indexOf(',');
  if (comma < 0 || !/;base64$/i.test(uri.slice(0, comma).trim())) {
    return undefined;
  }
  try {
    const binary = atob(uri.slice(comma + 1).trim());
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
}

/** Width and height of a PNG or baseline/progressive JPEG, read from its header. */
export function imageSize(
  bytes: Uint8Array,
): { width: number; height: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const isPng =
    bytes.length >= 24 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a &&
    view.getUint32(12) === 0x49484452; // "IHDR"
  if (isPng) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1; // fill byte
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2; // markers without a length
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return undefined; // no frame header before scan
    const length = view.getUint16(offset + 2);
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isFrame) {
      if (offset + 9 > bytes.length) return undefined;
      return {
        height: view.getUint16(offset + 5),
        width: view.getUint16(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return undefined;
}

/**
 * Applies the Scene Viewer rules to a parsed glTF. `bin` is the GLB's BIN
 * chunk, if any. Returns the first rejection, or the metadata and warnings.
 */
export function checkGltfCompatibility(
  json: Json,
  bin: Uint8Array | undefined,
  sizeBytes: number,
): GlbInspection {
  const warnings: string[] = [];

  if (sizeBytes > RECOMMENDED_GLB_SIZE_BYTES) {
    warnings.push(
      `The model is ${(sizeBytes / MB).toFixed(1)} MB. Android Scene Viewer recommends 10 MB or less for a smooth start.`,
    );
  }

  // Extensions.
  const used = asStrings(json.extensionsUsed);
  const required = asStrings(json.extensionsRequired);
  const compressed = [...used, ...required].find((name) =>
    COMPRESSION_EXTENSIONS.includes(name),
  );
  if (compressed) return { error: compressionMessage(compressed) };
  const unsupportedRequired = required.find(
    (name) => !SCENE_VIEWER_EXTENSIONS.includes(name),
  );
  if (unsupportedRequired) {
    return { error: requiredExtensionMessage(unsupportedRequired) };
  }
  const ignored = used.filter(
    (name) => !SCENE_VIEWER_EXTENSIONS.includes(name),
  );
  if (ignored.length > 0) {
    warnings.push(
      `Android Scene Viewer ignores these glTF extensions, so the model may look different there: ${ignored.join(', ')}.`,
    );
  }

  // Meshes.
  const accessors = asArray(json.accessors);
  const accessorCount = (index: unknown) => {
    const i = asIndex(index);
    return i === undefined ? 0 : (asIndex(asObject(accessors[i])?.count) ?? 0);
  };
  const meshes = asArray(json.meshes);
  const meshTriangles: number[] = [];
  for (const mesh of meshes) {
    let triangles = 0;
    for (const primitiveValue of asArray(asObject(mesh)?.primitives)) {
      const primitive = asObject(primitiveValue) ?? {};
      const attributes = asObject(primitive.attributes) ?? {};
      const mode = primitive.mode === undefined ? 4 : primitive.mode;
      if (mode !== 4 && mode !== 5 && mode !== 6) {
        return { error: UNSUPPORTED_PRIMITIVE_MODE };
      }
      if (asArray(primitive.targets).length > 0) {
        return { error: MORPH_TARGETS_USED };
      }
      const names = Object.keys(attributes);
      if (names.some((name) => name.startsWith('COLOR_'))) {
        return { error: VERTEX_COLORS_USED };
      }
      if (names.some((name) => /^TEXCOORD_[1-9]/.test(name))) {
        return { error: TOO_MANY_UV_SETS };
      }
      if (names.some((name) => /^(JOINTS|WEIGHTS)_[1-9]/.test(name))) {
        return { error: TOO_MANY_BONE_WEIGHTS };
      }
      const vertices =
        primitive.indices !== undefined
          ? accessorCount(primitive.indices)
          : accessorCount(attributes.POSITION);
      triangles +=
        mode === 4 ? Math.floor(vertices / 3) : Math.max(vertices - 2, 0);
    }
    meshTriangles.push(triangles);
  }

  if (
    asArray(json.skins).some(
      (skin) => asArray(asObject(skin)?.joints).length > MAX_SKIN_JOINTS,
    )
  ) {
    return { error: TOO_MANY_JOINTS };
  }

  // A mesh drawn by several nodes is drawn several times.
  const nodes = asArray(json.nodes);
  const uses = new Map<number, number>();
  for (const node of nodes) {
    const mesh = asIndex(asObject(node)?.mesh);
    if (mesh !== undefined) uses.set(mesh, (uses.get(mesh) ?? 0) + 1);
  }
  const triangleCount = meshTriangles.reduce(
    (sum, triangles, index) =>
      sum + triangles * (uses.get(index) ?? (nodes.length === 0 ? 1 : 0)),
    0,
  );
  if (triangleCount > RECOMMENDED_MAX_TRIANGLES) {
    warnings.push(
      `The model has ${triangleCount.toLocaleString('en-US')} triangles. Android Scene Viewer recommends 100,000 or fewer (30,000 to 50,000 is ideal).`,
    );
  }

  const materialCount = asArray(json.materials).length;
  if (materialCount > RECOMMENDED_MAX_MATERIALS) {
    warnings.push(
      `The model has ${materialCount} materials. Android Scene Viewer recommends 10 or fewer.`,
    );
  }

  const animationCount = asArray(json.animations).length;
  if (animationCount > 1) {
    warnings.push(
      `The model has ${animationCount} animations. Android Scene Viewer only plays the first one.`,
    );
  }

  // Textures.
  const buffers = asArray(json.buffers);
  const bufferViews = asArray(json.bufferViews);
  const bufferBytes = (index: number): Uint8Array | undefined => {
    const buffer = asObject(buffers[index]);
    if (!buffer) return undefined;
    if (typeof buffer.uri === 'string') return decodeDataUri(buffer.uri);
    return index === 0 ? bin : undefined;
  };
  const imageBytes = (image: Json): Uint8Array | undefined => {
    if (typeof image.uri === 'string') return decodeDataUri(image.uri);
    const view = asObject(bufferViews[asIndex(image.bufferView) ?? -1]);
    const bytes = bufferBytes(asIndex(view?.buffer) ?? -1);
    const start = asIndex(view?.byteOffset ?? 0);
    const length = asIndex(view?.byteLength);
    if (!bytes || start === undefined || length === undefined) return undefined;
    if (start + length > bytes.length) return undefined;
    return bytes.subarray(start, start + length);
  };

  const images = asArray(json.images);
  let largestTexture: GlbMetadata['largestTexture'] = null;
  for (const imageValue of images) {
    const image = asObject(imageValue) ?? {};
    if (
      image.mimeType !== undefined &&
      image.mimeType !== 'image/png' &&
      image.mimeType !== 'image/jpeg'
    ) {
      return { error: UNSUPPORTED_TEXTURE_FORMAT };
    }
    const bytes = imageBytes(image);
    if (!bytes) return { error: UNREADABLE_TEXTURE };
    const size = imageSize(bytes);
    if (!size) return { error: UNSUPPORTED_TEXTURE_FORMAT };
    if (size.width > MAX_TEXTURE_SIZE || size.height > MAX_TEXTURE_SIZE) {
      return { error: textureTooLargeMessage(size.width, size.height) };
    }
    if (
      !largestTexture ||
      size.width * size.height > largestTexture.width * largestTexture.height
    ) {
      largestTexture = size;
    }
  }

  return {
    metadata: {
      sizeBytes,
      meshCount: meshes.length,
      triangleCount,
      materialCount,
      textureCount: images.length,
      largestTexture,
      animationCount,
      extensionsUsed: used,
    },
    warnings,
  };
}

/** Full check of a GLB: structure, self-containment, then Scene Viewer rules. */
export function inspectGlb(file: Uint8Array): GlbInspection {
  if (file.length > MAX_GLB_SIZE_BYTES) return { error: GLB_TOO_LARGE };
  if (file.length < GLB_HEADER_BYTES) return { error: INVALID_GLB };
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);

  const declaredLength = view.getUint32(8, true);
  const jsonLength = view.getUint32(12, true);
  if (
    view.getUint32(0, true) !== GLB_MAGIC ||
    view.getUint32(4, true) !== 2 ||
    declaredLength > file.length ||
    view.getUint32(16, true) !== GLB_JSON_CHUNK ||
    GLB_HEADER_BYTES + jsonLength > declaredLength
  ) {
    return { error: INVALID_GLB };
  }

  let json: Json;
  try {
    const parsed: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        file.subarray(GLB_HEADER_BYTES, GLB_HEADER_BYTES + jsonLength),
      ),
    );
    const object = asObject(parsed);
    if (!object) return { error: INVALID_GLB };
    json = object;
    if (externalGltfReferences(json).length > 0) {
      return { error: EXTERNAL_GLB_REFERENCES };
    }
  } catch {
    // Bad UTF-8, bad JSON, or nesting too deep to walk.
    return { error: INVALID_GLB };
  }

  // The optional BIN chunk follows the JSON chunk.
  let bin: Uint8Array | undefined;
  const binHeader = GLB_HEADER_BYTES + jsonLength;
  if (binHeader + 8 <= declaredLength) {
    const binLength = view.getUint32(binHeader, true);
    if (
      view.getUint32(binHeader + 4, true) !== GLB_BIN_CHUNK ||
      binHeader + 8 + binLength > declaredLength
    ) {
      return { error: INVALID_GLB };
    }
    bin = file.subarray(binHeader + 8, binHeader + 8 + binLength);
  }

  return checkGltfCompatibility(json, bin, file.length);
}

/** Returns the rejection message for a GLB, or undefined when it is accepted. */
export function glbFileError(file: Uint8Array): string | undefined {
  return inspectGlb(file).error;
}
