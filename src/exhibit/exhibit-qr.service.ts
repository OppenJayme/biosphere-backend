import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';

const DEFAULT_PUBLIC_SITE_URL = 'http://localhost:3000';

// Level H recovers up to ~30% of a damaged or dirty printed code.
const ERROR_CORRECTION = 'H' as const;

export type QrImageFormat = 'png' | 'svg';

export interface ExhibitLabelContent {
  publicUrl: string;
  commonName: string | null;
  scientificName: string | null;
}

// Public URL, QR code, and printable label for a QR exhibit page
// (REQ-4.12-04/05/06/12). The QR only encodes the page's public URL, so it
// never expires and can be regenerated identically at any time; it changes
// only when the curator intentionally replaces the URL (REQ-4.12-10).
@Injectable()
export class ExhibitQrService {
  constructor(private readonly config: ConfigService) {}

  // PUBLIC_SITE_URL is the visitor-facing site printed on labels. Set it to
  // the production domain before printing; FRONTEND_URL is only a fallback.
  // In production an unset site URL gives null rather than localhost, so a
  // label is never printed with an address visitors cannot open.
  publicUrl(slug: string): string | null {
    const configured =
      this.config.get<string>('PUBLIC_SITE_URL') ||
      this.config.get<string>('FRONTEND_URL');
    const base =
      configured ||
      (this.config.get<string>('NODE_ENV') === 'production'
        ? null
        : DEFAULT_PUBLIC_SITE_URL);
    return base
      ? `${base.replace(/\/+$/, '')}/exhibits/${encodeURIComponent(slug)}`
      : null;
  }

  async qrPng(url: string, size: number): Promise<Buffer> {
    return QRCode.toBuffer(url, {
      type: 'png',
      errorCorrectionLevel: ERROR_CORRECTION,
      margin: 4,
      width: size,
    });
  }

  async qrSvg(url: string): Promise<string> {
    return QRCode.toString(url, {
      type: 'svg',
      errorCorrectionLevel: ERROR_CORRECTION,
      margin: 4,
    });
  }

  // Printable label (REQ-4.12-06): museum name, specimen names, the QR code,
  // and the human-readable URL so visitors without a scanner can type it
  // (REQ-4.12-12). SVG scales cleanly to any print size.
  async label(content: ExhibitLabelContent): Promise<string> {
    const qr = await this.qrSvg(content.publicUrl);
    // Reuse the QR's own viewBox and paths inside the label.
    const viewBox = /viewBox="([^"]+)"/.exec(qr)?.[1] ?? '0 0 41 41';
    const inner = qr
      .replace(/^[\s\S]*?<svg[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '');
    const title = content.commonName ?? content.scientificName ?? 'Exhibit';
    const subtitle =
      content.commonName && content.scientificName
        ? content.scientificName
        : null;
    const urlLines = wrapUrl(content.publicUrl, URL_LINE_LENGTH);
    const height = 468 + urlLines.length * 20 + 32;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="${height}" viewBox="0 0 400 ${height}" font-family="Arial, Helvetica, sans-serif">
  <rect width="400" height="${height}" fill="#ffffff" stroke="#1f2a24" stroke-width="2"/>
  <text x="200" y="44" text-anchor="middle" font-size="14" letter-spacing="2" fill="#2f6b4f" font-weight="bold">BIOSPHERE MUSEUM</text>
  <text x="200" y="84" text-anchor="middle" font-size="24" font-weight="bold" fill="#1f2a24">${escapeXml(truncate(title, 28))}</text>
  ${
    subtitle
      ? `<text x="200" y="112" text-anchor="middle" font-size="16" font-style="italic" fill="#5b6b62">${escapeXml(truncate(subtitle, 36))}</text>`
      : ''
  }
  <svg x="60" y="130" width="280" height="280" viewBox="${viewBox}" shape-rendering="crispEdges">${inner}</svg>
  <text x="200" y="440" text-anchor="middle" font-size="14" fill="#1f2a24">Scan to learn more, or visit:</text>
${urlLines
  .map(
    (line, index) =>
      `  <text x="200" y="${468 + index * 20}" text-anchor="middle" font-size="13" font-family="monospace" fill="#1f2a24">${escapeXml(line)}</text>`,
  )
  .join('\n')}
</svg>`;
  }
}

const URL_LINE_LENGTH = 44;

// The printed URL must stay complete and exact, so long URLs wrap onto more
// lines (preferring a break after "/") instead of being shortened.
export function wrapUrl(url: string, maxLength: number): string[] {
  const lines: string[] = [];
  let rest = url;
  while (rest.length > maxLength) {
    const slash = rest.lastIndexOf('/', maxLength - 1);
    const cut = slash > maxLength / 2 ? slash + 1 : maxLength;
    lines.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  lines.push(rest);
  return lines;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
