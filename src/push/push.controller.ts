import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { PushSubscriptionDto } from './dto/push-subscription.dto';
import { PushConfigResponse } from './push.entity';
import { PushService } from './push.service';

// Curator-only. The device always belongs to the signed-in account; no
// request field can name another curator.
@ApiTags('push')
@Roles('CURATOR')
@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('config')
  @ApiOperation({ summary: 'Whether push alerts are on, and the VAPID key' })
  @ApiOkResponse({ type: PushConfigResponse })
  getConfig(): PushConfigResponse {
    return this.push.getConfig();
  }

  @Post('subscriptions')
  @HttpCode(200)
  @ApiOperation({ summary: 'Turn on push alerts for this browser' })
  @ApiOkResponse({ description: '{ subscribed: true }' })
  async subscribe(
    @Body() dto: PushSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.push.subscribe(user.accountId, dto.endpoint);
    return { subscribed: true };
  }

  @Delete('subscriptions')
  @HttpCode(200)
  @ApiOperation({ summary: 'Turn off push alerts for this browser' })
  @ApiOkResponse({ description: '{ subscribed: false }' })
  async unsubscribe(
    @Body() dto: PushSubscriptionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.push.unsubscribe(user.accountId, dto.endpoint);
    return { subscribed: false };
  }
}
