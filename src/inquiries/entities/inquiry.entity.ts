import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum InquiryStatus {
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
}

export class Inquiry {
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

  @ApiPropertyOptional()
  address?: string;

  @ApiProperty()
  message!: string;

  @ApiProperty({ enum: InquiryStatus, default: InquiryStatus.PENDING })
  status!: InquiryStatus;

  @ApiProperty()
  createdAt!: Date;
}
