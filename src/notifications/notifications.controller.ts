import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
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
  ): Promise<CuratorNotificationFeed> {
    return this.notificationsService.getFeed(query.limit);
  }
}
