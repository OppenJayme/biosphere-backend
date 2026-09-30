import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SupabaseModule } from '../supabase/supabase.module';
import { ExhibitsController } from './exhibits.controller';
import { ExhibitQrService } from './exhibit-qr.service';
import { ExhibitsService } from './exhibits.service';

@Module({
  imports: [PrismaModule, SupabaseModule],
  controllers: [ExhibitsController],
  providers: [ExhibitsService, ExhibitQrService],
  exports: [ExhibitsService],
})
export class ExhibitsModule {}
