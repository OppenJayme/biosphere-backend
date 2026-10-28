import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { UpdateNotificationStateDto } from './dto/update-notification-state.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';
import { CuratorNotificationFeed } from './entities/curator-notification.entity';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Roles('CURATOR')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'New inquiries and visit requests awaiting review, newest first (curator-only)',
  })
  @ApiOkResponse({ type: CuratorNotificationFeed })
  getFeed(
    @Query() query: ListNotificationsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CuratorNotificationFeed> {
    return this.notificationsService.getFeed(query.limit, user.accountId);
  }

  @Patch('state')
  @ApiOperation({
    summary:
      'Mark an active notification read or dismissed for the acting curator only',
  })
  @ApiOkResponse({
    description: 'State persisted; reload the feed for authoritative counts',
  })
  async updateState(
    @Body() dto: UpdateNotificationStateDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.notificationsService.updateState(user.accountId, dto);
    return { updated: true };
  }
}
