import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SecurityAuditAction = 'LOGIN' | 'ACCESS_DENIED';
export type SecurityAuditResult = 'SUCCESS' | 'FAILED' | 'DENIED';

export interface SecurityAuditEvent {
  action: SecurityAuditAction;
  result: SecurityAuditResult;
  /** BioSphere user_account.id, when the attempt can be tied to an account. */
  accountId?: string | null;
  /** Never include passwords, tokens, or other secrets. */
  details: Prisma.InputJsonObject;
}

/**
 * Records authentication attempts and denied access in the protected audit
 * log (REQ-4.1-15, REQ-4.15-01, SRS 4.2.2 / 4.15.2).
 *
 * A failure to write the audit entry is logged and swallowed: it must never
 * turn a successful sign-in into an error or mask the original denial.
 */
@Injectable()
export class SecurityAuditService {
  private readonly logger = new Logger(SecurityAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(event: SecurityAuditEvent): Promise<void> {
    const accountId = event.accountId ?? null;
    try {
      await this.prisma.audit_log.create({
        data: {
          user_id: accountId,
          affected_record_id: accountId,
          affected_record_type: 'user_account',
          action: event.action,
          module: 'auth',
          details: event.details,
          status: event.result,
        },
      });
    } catch (error) {
      this.logger.error(
        `Could not record ${event.action} (${event.result}) in the audit log.`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
