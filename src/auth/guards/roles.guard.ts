import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { SecurityAuditService } from '../security-audit.service';
import { requestPath } from './request-path';
import type { AuthenticatedRequest, UserRole } from '../types/auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly securityAudit: SecurityAuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const user = req.user;

    if (!user?.role || !requiredRoles.includes(user.role)) {
      // e.g. a Developer opening a curator route (SRS 4.2.2). record()
      // never rejects, so the denial is not delayed or replaced.
      void this.securityAudit.record({
        action: 'ACCESS_DENIED',
        result: 'DENIED',
        accountId: user?.accountId ?? null,
        details: {
          reason: 'ROLE_NOT_PERMITTED',
          role: user?.role ?? null,
          requiredRoles,
          method: req.method,
          path: requestPath(req),
        },
      });
      throw new ForbiddenException(
        `Requires role: ${requiredRoles.join(' or ')}`,
      );
    }

    return true;
  }
}
