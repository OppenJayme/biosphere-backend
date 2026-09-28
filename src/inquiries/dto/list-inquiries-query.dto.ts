import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { optionalSearchTerm } from '../../communication-history/dto/search-query.transform';
import { InquiryStatus } from '../entities/inquiry.entity';

export class ListInquiriesQueryDto {
  @ApiPropertyOptional({ enum: InquiryStatus })
  @IsOptional()
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;

  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Case-insensitive match on name, email, organization, inquiry type, or message',
  })
  @IsOptional()
  @Transform(optionalSearchTerm)
  @IsString()
  @MaxLength(100)
  search?: string;
}
