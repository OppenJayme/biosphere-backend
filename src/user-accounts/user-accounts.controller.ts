/** Curator account list and curator-to-curator invitations for the curator Users page. */

import { Body, Controller, Get, Header, Post } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { InviteCuratorDto } from './dto/invite-curator.dto';
import { UserAccountsService } from './user-accounts.service';
import { UserAccountSummary } from './entities/user-account-summary.entity';

@ApiTags('user-accounts')
@Roles('CURATOR')
@Controller('user-accounts')
export class UserAccountsController {
  constructor(private readonly service: UserAccountsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'List curator accounts with email, status, and last sign-in (newest first)',
  })
  @ApiOkResponse({ type: UserAccountSummary, isArray: true })
  list(): Promise<UserAccountSummary[]> {
    return this.service.list();
  }

  @Post('invitations')
  @ApiOperation({
    summary:
      'Invite another curator: creates a separate curator account and emails a password-setup link (REQ-4.1-07)',
  })
  @ApiCreatedResponse({ type: UserAccountSummary })
  @ApiConflictResponse({
    description: 'The email already belongs to an account',
  })
  invite(
    @Body() dto: InviteCuratorDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserAccountSummary> {
    return this.service.inviteCurator(dto, user);
  }
}
