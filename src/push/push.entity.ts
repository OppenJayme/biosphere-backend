import { ApiProperty } from '@nestjs/swagger';

export class PushConfigResponse {
  @ApiProperty({ description: 'Whether this server sends push alerts' })
  enabled!: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'VAPID public key for PushManager.subscribe, base64url',
  })
  publicKey!: string | null;
}
