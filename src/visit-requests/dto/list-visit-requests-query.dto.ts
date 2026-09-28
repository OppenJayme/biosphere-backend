import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { VisitRequestStatus } from '../entities/visit-request.entity';

export class ListVisitRequestsQueryDto {
  @ApiPropertyOptional({ enum: VisitRequestStatus })
  @IsOptional()
  @IsEnum(VisitRequestStatus)
  status?: VisitRequestStatus;
}
