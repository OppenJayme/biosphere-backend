import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VisitorDto } from '../dto/visitor.dto';

export enum VisitRequestStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DECLINED = 'DECLINED',
}

export class VisitRequest {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional()
  organization?: string;

  @ApiProperty()
  purpose!: string;

  @ApiProperty()
  preferredDate!: string;

  @ApiProperty()
  startTime!: string;

  @ApiProperty()
  endTime!: string;

  @ApiProperty()
  visitorCount!: number;

  @ApiPropertyOptional({ type: [VisitorDto] })
  visitors?: VisitorDto[];

  @ApiPropertyOptional()
  visitorListUrl?: string;

  @ApiPropertyOptional({ default: false })
  bringingVehicle?: boolean;

  @ApiPropertyOptional()
  plateNumber?: string;

  @ApiPropertyOptional()
  carBrand?: string;

  @ApiPropertyOptional()
  carType?: string;

  @ApiPropertyOptional()
  equipment?: string;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty({
    enum: VisitRequestStatus,
    default: VisitRequestStatus.PENDING,
  })
  status!: VisitRequestStatus;

  @ApiProperty()
  createdAt!: Date;
}
