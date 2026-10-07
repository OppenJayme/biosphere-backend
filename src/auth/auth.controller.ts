import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { LOGIN_RATE_LIMIT } from '../config/rate-limit.config';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { CurrentUserProfile } from './entities/current-user-profile.entity';
import { bearerToken } from './guards/bearer-token';
import { requestPath } from './guards/request-path';
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

  // Public to the global guard, which refuses a pending invite; the service
  // authenticates the invite session itself.
  @Public()
  @Throttle({ default: LOGIN_RATE_LIMIT })
  @Post('onboarding/complete')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Finish curator onboarding after the invited user has set a password (REQ-4.1-07, REQ-4.1-11)',
  })
  completeOnboarding(
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
  ) {
    return this.authService.completeOnboarding(bearerToken(authorization), {
      method: req.method,
      path: requestPath(req),
    });
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
