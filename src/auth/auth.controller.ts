import {
  Body,
  Controller,
  Get,
  Header,
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
import {
  ChangePasswordDto,
  CompleteOnboardingDto,
  RequestPasswordRecoveryDto,
  ResetPasswordDto,
} from './dto/password.dto';
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
      'Set the first password of an invited user and finish onboarding (REQ-4.1-07, REQ-4.1-11)',
  })
  completeOnboarding(
    @Body() dto: CompleteOnboardingDto,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
  ) {
    return this.authService.completeOnboarding(
      bearerToken(authorization),
      dto.password,
      { method: req.method, path: requestPath(req) },
    );
  }

  @Throttle({ default: LOGIN_RATE_LIMIT })
  @Post('password/change')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Change your own password after confirming the current one; every session ends (REQ-4.1-16, REQ-4.1-18)',
  })
  changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('authorization') authorization: string | undefined,
  ) {
    return this.authService.changePassword(
      user,
      bearerToken(authorization),
      dto,
    );
  }

  // The response is the same whether or not the account exists (REQ-4.1-10).
  @Public()
  @Throttle({ default: LOGIN_RATE_LIMIT })
  @Post('password/recovery')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Email a password-reset code to an account holder (REQ-4.1-10)',
  })
  requestPasswordRecovery(@Body() dto: RequestPasswordRecoveryDto) {
    return this.authService.requestPasswordRecovery(dto.email);
  }

  // Public to the global guard, which refuses a pending invite; the service
  // authenticates the recovery session itself.
  @Public()
  @Throttle({ default: LOGIN_RATE_LIMIT })
  @Post('password/reset')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary:
      'Set a new password with a recovery session; every session ends (REQ-4.1-10, REQ-4.1-11)',
  })
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
  ) {
    return this.authService.resetPassword(
      bearerToken(authorization),
      dto.newPassword,
      { method: req.method, path: requestPath(req) },
    );
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
