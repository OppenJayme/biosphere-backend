import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { SyncSpecimenDraftDto } from './dto/sync-specimen-draft.dto';
import { OfflineSpecimenDraftSyncResult } from './entities/offline-specimen-draft-sync-result.entity';
import { OfflineSyncService } from './offline-sync.service';

@ApiTags('offline-sync')
@Roles('CURATOR')
@Controller('offline-sync')
export class OfflineSyncController {
  constructor(private readonly service: OfflineSyncService) {}

  @Post('specimen-drafts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Synchronize one authenticated curator text-only specimen draft',
  })
  @ApiOkResponse({ type: OfflineSpecimenDraftSyncResult })
  syncSpecimenDraft(
    @Body() dto: SyncSpecimenDraftDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<OfflineSpecimenDraftSyncResult> {
    return this.service.syncSpecimenDraft(dto, user.accountId);
  }
}
