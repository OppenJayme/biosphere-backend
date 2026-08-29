import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_CLIENT } from "src/supabase/supabase-client.provider";
import { IS_PUBLIC_KEY } from "./public.decorator";

@Injectable()
export class SupabaseAuthGuard implements CanActivate {
    constructor(
        @Inject(SUPABASE_CLIENT) private readonly supabase: SupabaseClient,
        private readonly reflector: Reflector,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) return true;

        const req = context.switchToHttp().getRequest();
        const authHeader = req.headers['authorization'];

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedException('Missing or Malformed Token');
        }

        const token = authHeader.split(' ')[1];

        const { data, error } = await this.supabase.auth.getUser(token);

        if (error || !data.user) {
            throw new UnauthorizedException('Invalide or Expired Session');
        }

        req.user = {
            id: data.user.id,
            email: data.user.email,
            role: (data.user.app_metadata as any)?.role ?? null,
        };

        console.log(req.user);

        return true;
    }
}