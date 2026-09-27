import {
  BadRequestException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as QRCode from 'qrcode';
import type { exhibit } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QrCodeInfo } from './entities/qr-code.entity';

const QR_MODULE_NAME = 'qr_exhibit';
const QR_IMAGE_WIDTH_PX = 512;
const QR_IMAGE_MARGIN = 2;

export type QrCodeFormat = 'PNG' | 'SVG';

// Generates printable QR codes for published exhibit pages (REQ-4.12-05/06).
// Storage-location and other internal fields are never encoded here — only
// the exhibit's already-public slug/URL (BR-11).
@Injectable()
export class QrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async getInfo(exhibitId: string): Promise<QrCodeInfo> {
    const exhibitRecord = await this.findExhibitOrThrow(exhibitId);
    return {
      exhibitId: exhibitRecord.id,
      publicSlug: exhibitRecord.public_slug,
      publicUrl: this.buildPublicUrl(exhibitRecord.public_slug),
    };
  }

  async generatePng(
    exhibitId: string,
    actingCuratorAccountId: string,
  ): Promise<Buffer> {
    const exhibitRecord = await this.findExhibitOrThrow(exhibitId);
    const url = this.buildPublicUrl(exhibitRecord.public_slug);

    let buffer: Buffer;
    try {
      buffer = await QRCode.toBuffer(url, {
        type: 'png',
        errorCorrectionLevel: 'M',
        margin: QR_IMAGE_MARGIN,
        width: QR_IMAGE_WIDTH_PX,
      });
    } catch {
      throw new InternalServerErrorException(
        `Unable to generate a QR code for exhibit ${exhibitId}.`,
      );
    }

    await this.recordAudit(exhibitId, actingCuratorAccountId, 'PNG');
    return buffer;
  }

  async generateSvg(
    exhibitId: string,
    actingCuratorAccountId: string,
  ): Promise<string> {
    const exhibitRecord = await this.findExhibitOrThrow(exhibitId);
    const url = this.buildPublicUrl(exhibitRecord.public_slug);

    let svg: string;
    try {
      svg = await QRCode.toString(url, {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: QR_IMAGE_MARGIN,
      });
    } catch {
      throw new InternalServerErrorException(
        `Unable to generate a QR code for exhibit ${exhibitId}.`,
      );
    }

    await this.recordAudit(exhibitId, actingCuratorAccountId, 'SVG');
    return svg;
  }

  // Preserves the same URL across regenerations as long as the slug is
  // unchanged (REQ-4.12-10); the slug itself is owned by ExhibitsService.
  private buildPublicUrl(publicSlug: string): string {
    const configuredBase =
      this.configService.get<string>('QR_EXHIBIT_BASE_URL') ??
      this.configService.getOrThrow<string>('FRONTEND_URL');
    const baseUrl = configuredBase.replace(/\/+$/, '');
    return `${baseUrl}/exhibits/${publicSlug}`;
  }

  private async findExhibitOrThrow(exhibitId: string): Promise<exhibit> {
    const exhibitRecord = await this.prisma.exhibit.findUnique({
      where: { id: exhibitId },
    });
    if (!exhibitRecord) {
      throw new NotFoundException(`Exhibit ${exhibitId} not found`);
    }
    if (exhibitRecord.archived_at) {
      throw new BadRequestException(
        'A QR code cannot be generated for an archived exhibit.',
      );
    }
    if (exhibitRecord.status !== 'PUBLISHED') {
      throw new BadRequestException(
        'A QR code can only be generated for a published exhibit.',
      );
    }
    return exhibitRecord;
  }

  private async recordAudit(
    exhibitId: string,
    actingCuratorAccountId: string,
    format: QrCodeFormat,
  ): Promise<void> {
    await this.prisma.audit_log.create({
      data: {
        user_id: actingCuratorAccountId,
        affected_record_id: exhibitId,
        affected_record_type: 'exhibit',
        action: 'GENERATE_EXHIBIT_QR',
        module: QR_MODULE_NAME,
        details: { format },
        status: 'SUCCESS',
      },
    });
  }
}
