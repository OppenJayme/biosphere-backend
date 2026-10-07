/** Wires the protected curator account list and curator invitations. */

import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { UserAccountsController } from './user-accounts.controller';
import { UserAccountsService } from './user-accounts.service';

@Module({
  imports: [PrismaModule],
  controllers: [UserAccountsController],
  providers: [UserAccountsService],
})
export class UserAccountsModule {}
