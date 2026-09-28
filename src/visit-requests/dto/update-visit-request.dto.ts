import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { VisitRequestStatus } from '../entities/visit-request.entity';

// Curators change workflow status only (REQ-4.9-09); the visitor's
// submitted details are never edited.
export class UpdateVisitRequestDto {
  @ApiProperty({ enum: VisitRequestStatus })
  @IsEnum(VisitRequestStatus)
  status!: VisitRequestStatus;
}
