import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';
import { AuditResult } from '../entities/audit-log.entity';

const TIMEZONE_SUFFIX = /(?:Z|[+-]\d{2}:\d{2})$/i;

export class ListAuditLogsQueryDto {
  @ApiPropertyOptional({
    maxLength: 100,
    description:
      'Search action, module, affected-record type, actor name, or a UUID identifier',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: AuditResult })
  @IsOptional()
  @IsEnum(AuditResult)
  result?: AuditResult;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  module?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  affectedRecordType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  affectedRecordId?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inclusive lower timestamp bound in ISO 8601 format',
  })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(TIMEZONE_SUFFIX, {
    message: 'from must include Z or an explicit UTC offset',
  })
  from?: string;

  @ApiPropertyOptional({
    format: 'date-time',
    description: 'Inclusive upper timestamp bound in ISO 8601 format',
  })
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(TIMEZONE_SUFFIX, {
    message: 'to must include Z or an explicit UTC offset',
  })
  to?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 1000000 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
