import { glbBytes } from '../../test/fixtures/glb';
import {
  EXTERNAL_GLB_REFERENCES,
  glbFileError,
  INVALID_GLB,
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
          images: [{ uri: ' DATA:image/png;base64,AAAA' }],
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
