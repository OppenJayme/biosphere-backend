import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import type { UserRole } from './types/auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Roles('CURATOR', 'DEVELOPER')
  @Post('invite')
  invite(
    @Body()
    body: {
      email: string;
      role: UserRole;
    },
  ) {
    return this.authService.inviteUser(body.email, body.role);
  }
}
