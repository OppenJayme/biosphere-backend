import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

// Public General Inquiry form (SRS REQ-4.8-02/03/04). Limits follow the
// inquiry table's column sizes; only the approved minimum is collected.
export class CreateInquiryDto {
  @ApiProperty({ example: 'Juan Dela Cruz', maxLength: 100 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'name@school.edu.ph', maxLength: 100 })
  @Transform(trimString)
  @IsEmail()
  @MaxLength(100)
  email!: string;

  @ApiPropertyOptional({ example: '0917 123 4567', maxLength: 20 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(/^[0-9+()\-\s]{7,20}$/, {
    message: 'phone must be 7-20 digits, spaces, or + ( ) - characters',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 'University of San Carlos', maxLength: 100 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  organization?: string;

  @ApiPropertyOptional({
    example: 'GENERAL',
    maxLength: 100,
    description: 'Inquiry category; defaults to GENERAL',
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  inquiryType?: string;

  @ApiProperty({
    example: 'Can we bring a class of 20 for a field trip?',
    maxLength: 2000,
  })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message!: string;

  @ApiProperty({
    example: true,
    description: 'Visitor accepted the approved privacy notice (must be true)',
  })
  @IsBoolean()
  @Equals(true, { message: 'The privacy notice must be accepted.' })
  consentAccepted!: boolean;
}
