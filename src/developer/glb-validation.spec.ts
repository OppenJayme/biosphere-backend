import {
  glbBytes,
  jpegHeader,
  pngHeader,
  texturedGlb,
} from '../../test/fixtures/glb';
import {
  compressionMessage,
  EXTERNAL_GLB_REFERENCES,
  GLB_TOO_LARGE,
  glbFileError,
  imageSize,
  inspectGlb,
  INVALID_GLB,
  MAX_GLB_SIZE_BYTES,
  MORPH_TARGETS_USED,
  requiredExtensionMessage,
  textureTooLargeMessage,
  TOO_MANY_BONE_WEIGHTS,
  TOO_MANY_JOINTS,
  TOO_MANY_UV_SETS,
  UNREADABLE_TEXTURE,
  UNSUPPORTED_PRIMITIVE_MODE,
  UNSUPPORTED_TEXTURE_FORMAT,
  VERTEX_COLORS_USED,
} from './glb-validation';

describe('glbFileError', () => {
  it('accepts a self-contained model', () => {
    expect(
      glbFileError(glbBytes({ buffers: [{ byteLength: 4 }] })),
    ).toBeUndefined();
  });

  it('accepts embedded data: URIs in any letter case', () => {
    expect(
      glbFileError(
        glbBytes({
          buffers: [{ uri: 'data:application/octet-stream;base64,AAAA' }],
          images: [
            {
              uri: ` DATA:image/png;base64,${pngHeader(1, 1).toString('base64')}`,
            },
          ],
        }),
      ),
    ).toBeUndefined();
  });

  it.each([
    ['an external buffer', { buffers: [{ uri: 'model.bin' }] }],
    ['an external texture', { images: [{ uri: 'https://x.test/a.png' }] }],
    ['a nested uri', { extensions: { a: [{ b: { uri: '../c.png' } }] } }],
    ['a uri that is not a string', { images: [{ uri: 7 }] }],
  ])('rejects %s', (_name, json) => {
    expect(glbFileError(glbBytes(json))).toBe(EXTERNAL_GLB_REFERENCES);
  });

  it('rejects a file shorter than the header', () => {
    expect(glbFileError(Buffer.from('glTF'))).toBe(INVALID_GLB);
  });

  it.each([
    ['magic', 0, 0],
    ['version', 4, 1],
    ['first chunk type', 16, 0],
  ])('rejects a wrong %s', (_name, offset, value) => {
    const file = glbBytes();
    file.writeUInt32LE(value, offset);
    expect(glbFileError(file)).toBe(INVALID_GLB);
  });

  it('rejects a declared length beyond the end of the file', () => {
    const file = glbBytes();
    file.writeUInt32LE(file.length + 1, 8);
    expect(glbFileError(file)).toBe(INVALID_GLB);
  });

  it('rejects a JSON chunk beyond the declared length', () => {
    const file = glbBytes();
    file.writeUInt32LE(file.length, 12);
    expect(glbFileError(file)).toBe(INVALID_GLB);
  });

  it('rejects a JSON chunk that does not parse', () => {
    const file = glbBytes();
    file.write('{', 20);
    file.write('{', 21);
    expect(glbFileError(file)).toBe(INVALID_GLB);
  });
});

// A triangle mesh drawn by `uses` nodes; accessor 0 has `indices` entries.
function meshJson(primitive: object = {}, indices = 3, uses = 1) {
  return {
    asset: { version: '2.0' },
    accessors: [{ count: indices }, { count: 4 }],
    meshes: [
      {
        primitives: [
          {
            attributes: { POSITION: 1, TEXCOORD_0: 1 },
            indices: 0,
            ...primitive,
          },
        ],
      },
    ],
    nodes: Array.from({ length: uses }, () => ({ mesh: 0 })),
  };
}

describe('inspectGlb (Scene Viewer compatibility, REQ-4.2-05)', () => {
  it('returns metadata for an accepted textured model', () => {
    const result = inspectGlb(
      texturedGlb(pngHeader(1024, 512), {
        ...meshJson({}, 300, 2),
        materials: [{}, {}],
        animations: [{}],
        extensionsUsed: ['KHR_texture_transform'],
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({
      metadata: {
        meshCount: 1,
        triangleCount: 200,
        materialCount: 2,
        textureCount: 1,
        largestTexture: { width: 1024, height: 512 },
        animationCount: 1,
        extensionsUsed: ['KHR_texture_transform'],
      },
      warnings: [],
    });
  });

  it('counts strips and fans as vertices minus two', () => {
    const result = inspectGlb(glbBytes(meshJson({ mode: 5 }, 10)));
    expect(result).toMatchObject({ metadata: { triangleCount: 8 } });
  });

  it('rejects a GLB over 15 MB', () => {
    const file = Buffer.alloc(MAX_GLB_SIZE_BYTES + 4, 0x20);
    glbBytes().copy(file);
    file.writeUInt32LE(file.length, 8);
    expect(glbFileError(file)).toBe(GLB_TOO_LARGE);
  });

  it.each([
    'KHR_draco_mesh_compression',
    'EXT_meshopt_compression',
    'KHR_texture_basisu',
    'EXT_texture_webp',
  ])('rejects the compression extension %s', (extension) => {
    expect(glbFileError(glbBytes({ extensionsUsed: [extension] }))).toBe(
      compressionMessage(extension),
    );
  });

  it('rejects a required extension Scene Viewer does not support', () => {
    expect(
      glbFileError(
        glbBytes({
          extensionsUsed: ['KHR_materials_volume'],
          extensionsRequired: ['KHR_materials_volume'],
        }),
      ),
    ).toBe(requiredExtensionMessage('KHR_materials_volume'));
  });

  it('only warns about an optional extension Scene Viewer ignores', () => {
    const result = inspectGlb(
      glbBytes({ extensionsUsed: ['KHR_materials_emissive_strength'] }),
    );
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({
      warnings: [expect.stringContaining('KHR_materials_emissive_strength')],
    });
  });

  it.each([
    ['morph targets', { targets: [{ POSITION: 1 }] }, MORPH_TARGETS_USED],
    [
      'vertex colors',
      { attributes: { POSITION: 1, COLOR_0: 1 } },
      VERTEX_COLORS_USED,
    ],
    [
      'a second UV set',
      { attributes: { POSITION: 1, TEXCOORD_1: 1 } },
      TOO_MANY_UV_SETS,
    ],
    [
      '8 bone weights',
      { attributes: { POSITION: 1, JOINTS_1: 1 } },
      TOO_MANY_BONE_WEIGHTS,
    ],
    ['lines', { mode: 1 }, UNSUPPORTED_PRIMITIVE_MODE],
    ['points', { mode: 0 }, UNSUPPORTED_PRIMITIVE_MODE],
  ])('rejects %s', (_name, primitive, message) => {
    expect(glbFileError(glbBytes(meshJson(primitive)))).toBe(message);
  });

  it('rejects a skin with more than 254 bones', () => {
    const joints = Array.from({ length: 255 }, (_, i) => i);
    expect(glbFileError(glbBytes({ skins: [{ joints }] }))).toBe(
      TOO_MANY_JOINTS,
    );
    expect(
      glbFileError(glbBytes({ skins: [{ joints: joints.slice(1) }] })),
    ).toBeUndefined();
  });

  it('accepts a 2048 texture and rejects a larger one', () => {
    expect(glbFileError(texturedGlb(pngHeader(2048, 2048)))).toBeUndefined();
    expect(glbFileError(texturedGlb(pngHeader(4096, 2048)))).toBe(
      textureTooLargeMessage(4096, 2048),
    );
    expect(glbFileError(texturedGlb(jpegHeader(2048, 2049)))).toBe(
      textureTooLargeMessage(2048, 2049),
    );
  });

  it('reads a texture embedded as a data: URI', () => {
    const uri = `data:image/png;base64,${pngHeader(3000, 10).toString('base64')}`;
    expect(glbFileError(glbBytes({ images: [{ uri }] }))).toBe(
      textureTooLargeMessage(3000, 10),
    );
  });

  it('rejects textures that are not PNG or JPEG', () => {
    expect(
      glbFileError(
        glbBytes({ images: [{ uri: 'data:image/ktx2;base64,AAAA' }] }),
      ),
    ).toBe(UNSUPPORTED_TEXTURE_FORMAT);
    expect(glbFileError(texturedGlb(Buffer.from('GIF89a----------')))).toBe(
      UNSUPPORTED_TEXTURE_FORMAT,
    );
  });

  it('rejects a texture whose bytes are missing', () => {
    expect(glbFileError(glbBytes({ images: [{ bufferView: 0 }] }))).toBe(
      UNREADABLE_TEXTURE,
    );
  });

  it('rejects a BIN chunk that runs past the file', () => {
    const file = texturedGlb(pngHeader(8, 8));
    const binHeader = file.length - 8 - 24;
    file.writeUInt32LE(1000, binHeader);
    expect(glbFileError(file)).toBe(INVALID_GLB);
  });

  it('warns past the recommended triangle, material and animation counts', () => {
    const result = inspectGlb(
      glbBytes({
        ...meshJson({}, 300_003),
        materials: Array.from({ length: 11 }, () => ({})),
        animations: [{}, {}],
      }),
    );
    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({
      warnings: [
        expect.stringContaining('100,001 triangles'),
        expect.stringContaining('11 materials'),
        expect.stringContaining('only plays the first'),
      ],
    });
  });
});

describe('imageSize', () => {
  it('skips JPEG segments before the frame header', () => {
    expect(imageSize(jpegHeader(640, 480))).toEqual({
      width: 640,
      height: 480,
    });
  });

  it('returns undefined for a JPEG that reaches the scan first', () => {
    expect(
      imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2])),
    ).toBeUndefined();
  });
});
