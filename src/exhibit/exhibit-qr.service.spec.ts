import { ConfigService } from '@nestjs/config';
import { ExhibitQrService, wrapUrl } from './exhibit-qr.service';

const serviceWith = (env: Record<string, string | undefined>) =>
  new ExhibitQrService({
    get: (key: string) => env[key],
  } as unknown as ConfigService);

describe('ExhibitQrService', () => {
  it('builds the public URL from PUBLIC_SITE_URL, then FRONTEND_URL', () => {
    expect(
      serviceWith({ PUBLIC_SITE_URL: 'https://museum.example/' }).publicUrl(
        'giant-beetle',
      ),
    ).toBe('https://museum.example/exhibits/giant-beetle');
    expect(
      serviceWith({ FRONTEND_URL: 'http://localhost:3000' }).publicUrl('a-b'),
    ).toBe('http://localhost:3000/exhibits/a-b');
    expect(serviceWith({}).publicUrl('a')).toBe(
      'http://localhost:3000/exhibits/a',
    );
  });

  it('never falls back to localhost in production', () => {
    expect(
      serviceWith({ NODE_ENV: 'production' }).publicUrl('giant-beetle'),
    ).toBeNull();
    expect(
      serviceWith({
        NODE_ENV: 'production',
        PUBLIC_SITE_URL: 'https://museum.example',
      }).publicUrl('giant-beetle'),
    ).toBe('https://museum.example/exhibits/giant-beetle');
  });

  it('escapes names on the label', async () => {
    const svg = await serviceWith({}).label({
      publicUrl: 'http://localhost:3000/exhibits/a',
      commonName: '<Beetle & Co>',
      scientificName: null,
    });

    expect(svg).toContain('&lt;Beetle &amp; Co&gt;');
    expect(svg).not.toContain('<Beetle');
  });

  it('wraps a long URL onto more lines without dropping characters', () => {
    const url = `https://museum.example/exhibits/${'a'.repeat(120)}`;

    const lines = wrapUrl(url, 44);

    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((line) => line.length <= 44)).toBe(true);
    expect(lines.join('')).toBe(url);
  });
});
