/** Read-only curator account list for the curator Users page. */

import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
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
}
