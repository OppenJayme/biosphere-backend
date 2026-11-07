/** Curator account list and curator-to-curator invitations for the curator Users page. */

import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  HttpCode,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { HandOverCuratorAccountDto } from './dto/hand-over-curator-account.dto';
import { InviteCuratorDto } from './dto/invite-curator.dto';
import { UpdateCuratorAccountStatusDto } from './dto/update-curator-account-status.dto';
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

  @Post('handover')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Hand over: the signed-in curator names an active successor with their own account; the outgoing account is deactivated and kept, and the handover is audited (REQ-4.1-09, REQ-4.1-11)',
  })
  @ApiOkResponse({
    type: UserAccountSummary,
    description: 'The outgoing curator account, now inactive',
  })
  @ApiNotFoundResponse({ description: 'No curator account has this id' })
  @ApiConflictResponse({
    description: 'The successor is not active or has not finished setup',
  })
  handOver(
    @Body() dto: HandOverCuratorAccountDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserAccountSummary> {
    return this.service.handOver(dto, user);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Reactivate another curator account, with a recorded reason (REQ-4.1-08). Deactivating another curator is refused: use handover, or the Developer route.',
  })
  @ApiOkResponse({ type: UserAccountSummary })
  @ApiForbiddenResponse({
    description: 'A curator cannot change their own account',
  })
  @ApiNotFoundResponse({ description: 'No curator account has this id' })
  @ApiConflictResponse({ description: 'The account changed while saving' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCuratorAccountStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<UserAccountSummary> {
    return this.service.updateCuratorStatus(id, dto, user);
  }
}
