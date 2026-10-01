import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SecurityAuditService } from './security-audit.service';
import { SupabaseAuthGuard } from './guards/supabase-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Module({
  imports: [PrismaModule, SupabaseModule],
  controllers: [AuthController],
  providers: [AuthService, SecurityAuditService, SupabaseAuthGuard, RolesGuard],
  exports: [AuthService, SecurityAuditService],
})
export class AuthModule {}
