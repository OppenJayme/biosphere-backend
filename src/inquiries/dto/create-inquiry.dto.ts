import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateInquiryDto {
  @ApiProperty({ example: 'Juan Dela Cruz' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'name@school.edu.ph' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '09XX XXX XXXX' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'University of San Carlos' })
  @IsOptional()
  @IsString()
  organization?: string;

  @ApiPropertyOptional({ example: 'Talamban, Cebu City' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiProperty({ example: 'Field trip, research, class requirement, etc.' })
  @IsString()
  @IsNotEmpty()
  message!: string;
}
