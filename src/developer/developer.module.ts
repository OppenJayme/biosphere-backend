import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { DeveloperController } from './developer.controller';
import { DeveloperService } from './developer.service';

@Module({
  imports: [PrismaModule, SupabaseModule],
  controllers: [DeveloperController],
  providers: [DeveloperService],
})
export class DeveloperModule {}
