import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { optionalSearchTerm } from '../../communication-history/dto/search-query.transform';
import { VisitRequestStatus } from '../entities/visit-request.entity';

export class ListVisitRequestsQueryDto {
  @ApiPropertyOptional({ enum: VisitRequestStatus })
  @IsOptional()
  @IsEnum(VisitRequestStatus)
  status?: VisitRequestStatus;

  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Case-insensitive match on contact person, email, organization, or purpose',
  })
  @IsOptional()
  @Transform(optionalSearchTerm)
  @IsString()
  @MaxLength(100)
  search?: string;
}
