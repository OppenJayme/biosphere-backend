import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';
import {
  general_inquiry_status,
  qr_exhibit_status,
  specimen_status,
  visit_request_status,
} from '../../generated/prisma/enums';
import { ReportPeriodType } from '../report-period';
import { ReportFormat, ReportType } from '../report-types';

function OptionalText(maxLength = 100): PropertyDecorator {
  return (target, key) => {
    IsOptional()(target, key);
    Transform(trimString)(target, key);
    IsString()(target, key);
    IsNotEmpty()(target, key);
    MaxLength(maxLength)(target, key);
  };
}

export class GenerateReportDto {
  @ApiProperty({ enum: ReportType })
  @IsEnum(ReportType)
  type!: ReportType;

  @ApiProperty({ enum: ReportFormat })
  @IsEnum(ReportFormat)
  format!: ReportFormat;

  @ApiProperty({
    enum: ReportPeriodType,
    description:
      'MONTHLY needs month, YEARLY needs year, CUSTOM needs from and to. Periods follow Philippine time (UTC+8).',
  })
  @IsEnum(ReportPeriodType)
  period!: ReportPeriodType;

  @ApiPropertyOptional({ example: '2026-09', description: 'YYYY-MM' })
  @OptionalText(7)
  month?: string;

  @ApiPropertyOptional({ example: 2026 })
  @IsOptional()
  @IsInt()
  year?: number;

  @ApiPropertyOptional({
    example: '2026-09-01',
    description: 'Inclusive YYYY-MM-DD',
  })
  @OptionalText(10)
  from?: string;

  @ApiPropertyOptional({
    example: '2026-09-30',
    description: 'Inclusive YYYY-MM-DD',
  })
  @OptionalText(10)
  to?: string;

  // Consolidated Museum Operations Report
  @ApiPropertyOptional({
    maxLength: 5000,
    description: 'Curator remarks printed in the Consolidated report',
  })
  @OptionalText(5000)
  remarks?: string;

  // Inventory Report
  @ApiPropertyOptional({ enum: specimen_status })
  @IsOptional()
  @IsEnum(specimen_status)
  specimenStatus?: specimen_status;

  @ApiPropertyOptional({ description: 'Specimen category, ignoring case' })
  @OptionalText()
  category?: string;

  @ApiPropertyOptional({ description: 'Taxonomic kingdom, ignoring case' })
  @OptionalText()
  kingdom?: string;

  @ApiPropertyOptional({ description: 'Taxonomic phylum, ignoring case' })
  @OptionalText()
  phylum?: string;

  @ApiPropertyOptional({ description: 'Taxonomic class, ignoring case' })
  @OptionalText()
  taxonClass?: string;

  @ApiPropertyOptional({ description: 'Taxonomic order, ignoring case' })
  @OptionalText()
  taxonOrder?: string;

  @ApiPropertyOptional({ description: 'Taxonomic family, ignoring case' })
  @OptionalText()
  family?: string;

  @ApiPropertyOptional({ description: 'Taxonomic genus, ignoring case' })
  @OptionalText()
  genus?: string;

  @ApiPropertyOptional({ description: 'Taxonomic species, ignoring case' })
  @OptionalText()
  species?: string;

  @ApiPropertyOptional({
    description:
      'Only specimens with an active lot in this condition, ignoring case',
  })
  @OptionalText()
  conditionClass?: string;

  @ApiPropertyOptional({
    description: 'Only specimens with an active lot in this storage unit',
  })
  @IsOptional()
  @IsUUID()
  storageUnitId?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Whether storageUnitId also matches its child units',
  })
  @IsOptional()
  @IsBoolean()
  includeDescendantUnits?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publicDisplay?: boolean;

  // General Inquiry Summary
  @ApiPropertyOptional({ enum: general_inquiry_status })
  @IsOptional()
  @IsEnum(general_inquiry_status)
  inquiryStatus?: general_inquiry_status;

  @ApiPropertyOptional({ description: 'Inquiry type, ignoring case' })
  @OptionalText()
  inquiryType?: string;

  // Visit-Request Summary
  @ApiPropertyOptional({ enum: visit_request_status })
  @IsOptional()
  @IsEnum(visit_request_status)
  visitStatus?: visit_request_status;

  // QR and AR Exhibit Report
  @ApiPropertyOptional({ enum: qr_exhibit_status })
  @IsOptional()
  @IsEnum(qr_exhibit_status)
  exhibitStatus?: qr_exhibit_status;

  @ApiPropertyOptional({
    description: 'Only exhibits with (true) or without (false) enabled AR',
  })
  @IsOptional()
  @IsBoolean()
  arEnabled?: boolean;
}

/** Every optional filter field, used to reject filters a report does not support. */
export const REPORT_FILTER_FIELDS = [
  'remarks',
  'specimenStatus',
  'category',
  'kingdom',
  'phylum',
  'taxonClass',
  'taxonOrder',
  'family',
  'genus',
  'species',
  'conditionClass',
  'storageUnitId',
  'includeDescendantUnits',
  'publicDisplay',
  'inquiryStatus',
  'inquiryType',
  'visitStatus',
  'exhibitStatus',
  'arEnabled',
] as const satisfies readonly (keyof GenerateReportDto)[];
