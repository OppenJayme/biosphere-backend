import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

// Stored as one visit_request_visitor.visitor_name (max 100 characters).
export class VisitorDto {
  @ApiProperty({ example: 'Juan', maxLength: 50 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName!: string;

  @ApiPropertyOptional({ example: 'Dela Cruz', maxLength: 49 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(49)
  lastName?: string;
}
