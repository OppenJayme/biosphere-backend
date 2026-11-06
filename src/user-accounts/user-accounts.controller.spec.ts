import { ArgumentMetadata, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { InviteCuratorDto } from './dto/invite-curator.dto';
import { UpdateCuratorAccountStatusDto } from './dto/update-curator-account-status.dto';
import { UserAccountsController } from './user-accounts.controller';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});
const metadata: ArgumentMetadata = { type: 'body', metatype: InviteCuratorDto };

describe('UserAccountsController', () => {
  it('limits every user-account route, including invitations, to curators', () => {
    const roles = new Reflector().get<string[]>(
      ROLES_KEY,
      UserAccountsController,
    );
    expect(roles).toEqual(['CURATOR']);
  });
});

describe('UpdateCuratorAccountStatusDto', () => {
  const statusMetadata: ArgumentMetadata = {
    type: 'body',
    metatype: UpdateCuratorAccountStatusDto,
  };

  it('trims the reason', async () => {
    await expect(
      pipe.transform(
        { status: 'INACTIVE', reason: '  Left  ' },
        statusMetadata,
      ),
    ).resolves.toEqual({ status: 'INACTIVE', reason: 'Left' });
  });

  it.each([
    { status: 'INACTIVE' },
    { status: 'INACTIVE', reason: '   ' },
    { status: 'INACTIVE', reason: 'x'.repeat(501) },
    { status: 'SUSPENDED', reason: 'Left' },
    { reason: 'Left' },
    { status: 'INACTIVE', reason: 'Left', role: 'DEVELOPER' },
  ])('rejects %j', async (body) => {
    await expect(pipe.transform(body, statusMetadata)).rejects.toThrow();
  });
});

describe('InviteCuratorDto', () => {
  it('trims the name and normalizes the email', async () => {
    await expect(
      pipe.transform(
        { email: '  New@USC.edu.ph ', fullName: '  Juan dela Cruz ' },
        metadata,
      ),
    ).resolves.toEqual({ email: 'new@usc.edu.ph', fullName: 'Juan dela Cruz' });
  });

  it.each([
    { email: 'not-an-email', fullName: 'Juan' },
    { email: 'new@usc.edu.ph', fullName: '   ' },
    { email: 'new@usc.edu.ph', fullName: 'x'.repeat(256) },
    { email: 'new@usc.edu.ph', fullName: 'Juan', role: 'DEVELOPER' },
  ])('rejects %j', async (body) => {
    await expect(pipe.transform(body, metadata)).rejects.toThrow();
  });
});
