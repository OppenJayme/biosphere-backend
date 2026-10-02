import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { SecurityAuditService } from './security-audit.service';

describe('SecurityAuditService', () => {
  const auditCreate = jest.fn();
  const service = new SecurityAuditService({
    audit_log: { create: auditCreate },
  } as unknown as PrismaService);

  beforeEach(() => jest.resetAllMocks());

  it('writes an auth-module audit entry for the account', async () => {
    await service.record({
      action: 'LOGIN',
      result: 'SUCCESS',
      accountId: 'account-1',
      details: { email: 'curator@example.com' },
    });

    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        user_id: 'account-1',
        affected_record_id: 'account-1',
        affected_record_type: 'user_account',
        action: 'LOGIN',
        module: 'auth',
        details: { email: 'curator@example.com' },
        status: 'SUCCESS',
      },
    });
  });

  it('records attempts that cannot be tied to an account', async () => {
    await service.record({
      action: 'LOGIN',
      result: 'FAILED',
      details: { reason: 'INVALID_CREDENTIALS' },
    });

    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        user_id: null,
        affected_record_id: null,
      }),
    });
  });

  it('never throws when the audit write fails', async () => {
    const logError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    auditCreate.mockRejectedValue(new Error('database unavailable'));

    await expect(
      service.record({
        action: 'ACCESS_DENIED',
        result: 'DENIED',
        details: {},
      }),
    ).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
    logError.mockRestore();
  });
});
