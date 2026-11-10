import { DEFAULT_CORS_ORIGIN, resolveCorsOrigins } from './cors.config';

describe('resolveCorsOrigins', () => {
  it('allows every origin listed in CORS_ORIGINS', () => {
    expect(
      resolveCorsOrigins({
        CORS_ORIGINS: 'https://biosphere.test,https://curator.biosphere.test',
        FRONTEND_URL: 'https://ignored.test',
      }),
    ).toEqual(['https://biosphere.test', 'https://curator.biosphere.test']);
  });

  it('trims whitespace, trailing slashes, blanks, and duplicates', () => {
    expect(
      resolveCorsOrigins({
        CORS_ORIGINS:
          ' https://biosphere.test/ , ,https://curator.biosphere.test,https://biosphere.test',
      }),
    ).toEqual(['https://biosphere.test', 'https://curator.biosphere.test']);
  });

  it('falls back to FRONTEND_URL when CORS_ORIGINS is unset or blank', () => {
    expect(
      resolveCorsOrigins({ FRONTEND_URL: 'https://curator.biosphere.test/' }),
    ).toEqual(['https://curator.biosphere.test']);
    expect(
      resolveCorsOrigins({
        CORS_ORIGINS: ' , ',
        FRONTEND_URL: 'https://curator.biosphere.test',
      }),
    ).toEqual(['https://curator.biosphere.test']);
  });

  it('falls back to the local frontend when nothing is configured', () => {
    expect(resolveCorsOrigins({})).toEqual([DEFAULT_CORS_ORIGIN]);
  });
});
