import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl, MaxLength } from 'class-validator';
import { PUSH_ENDPOINT_MAX_LENGTH } from '../push-endpoint';

// Only the endpoint is sent: pushes carry no payload, so the browser's
// encryption keys are never needed or stored. The service also checks the
// endpoint against the known push services.
export class PushSubscriptionDto {
  @ApiProperty({
    description: "The browser's PushSubscription.endpoint",
    maxLength: PUSH_ENDPOINT_MAX_LENGTH,
  })
  @IsString()
  @MaxLength(PUSH_ENDPOINT_MAX_LENGTH)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  endpoint!: string;
}
