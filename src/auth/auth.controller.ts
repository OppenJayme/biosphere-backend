import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LOGIN_RATE_LIMIT } from '../config/rate-limit.config';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { CurrentUserProfile } from './entities/current-user-profile.entity';
import type { AuthenticatedUser } from './types/auth.types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: LOGIN_RATE_LIMIT })
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the signed-in curator/developer profile' })
  @ApiOkResponse({ type: CurrentUserProfile })
  async me(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CurrentUserProfile> {
    const fullName = await this.authService.getFullName(user.accountId);
    return {
      accountId: user.accountId,
      email: user.email,
      fullName,
      role: user.role,
    };
  }
}
