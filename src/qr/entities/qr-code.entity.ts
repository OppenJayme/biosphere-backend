import { ApiProperty } from '@nestjs/swagger';

export class QrCodeInfo {
  @ApiProperty()
  exhibitId!: string;

  @ApiProperty()
  publicSlug!: string;

  @ApiProperty({
    description: 'Human-readable direct URL encoded by the QR code (REQ-4.12-06)',
  })
  publicUrl!: string;
}