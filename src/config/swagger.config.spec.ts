import { resolveSwaggerEnabled } from './swagger.config';

describe('resolveSwaggerEnabled', () => {
  it('is on by default outside production', () => {
    expect(resolveSwaggerEnabled({})).toBe(true);
    expect(resolveSwaggerEnabled({ NODE_ENV: 'development' })).toBe(true);
    expect(resolveSwaggerEnabled({ NODE_ENV: 'test' })).toBe(true);
  });

  it('is off by default in production', () => {
    expect(resolveSwaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
    expect(
      resolveSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: '  ' }),
    ).toBe(false);
  });

  it('follows an explicit setting in any case', () => {
    expect(
      resolveSwaggerEnabled({
        NODE_ENV: 'production',
        SWAGGER_ENABLED: 'TRUE',
      }),
    ).toBe(true);
    expect(
      resolveSwaggerEnabled({
        NODE_ENV: 'development',
        SWAGGER_ENABLED: 'false',
      }),
    ).toBe(false);
  });

  it('ignores an unrecognised value and falls back to the default', () => {
    expect(
      resolveSwaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'yes' }),
    ).toBe(false);
  });
});
