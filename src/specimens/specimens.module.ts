import { Module } from '@nestjs/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import { SpecimensService } from './specimens.service';
import { SpecimensController } from './specimens.controller';

@Module({
  imports: [PrismaModule],
  controllers: [SpecimensController],
  providers: [SpecimensService],
  exports: [SpecimensService],
})
export class SpecimensModule {}