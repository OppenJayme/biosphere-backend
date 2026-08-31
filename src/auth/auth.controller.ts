import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { Public } from "./decorators/public.decorator";
import { Roles } from "./decorators/roles.decorator";

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Public()
    @Post('login')
    login(@Body() body: { email: string; password: string }) {
        return this.authService.login(body.email, body.password);
    }

    @Roles('curator', 'developer')
    @Post('invite')
    invite(@Body() body: { email: string; role: 'curator' | 'developer' }) {
        return this.authService.inviteUser(body.email, body.role)
    }
}