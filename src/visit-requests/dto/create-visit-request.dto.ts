import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { VisitorDto } from './visitor.dto';

export class CreateVisitRequestDto {
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

  @ApiProperty({ example: 'Field trip, research, class requirement, etc.' })
  @IsString()
  @IsNotEmpty()
  purpose!: string;

  @ApiProperty({
    example: '2026-09-15',
    description: 'Preferred visit date (ISO 8601)',
  })
  @IsDateString()
  preferredDate!: string;

  @ApiProperty({ example: '09:00', description: '24-hour HH:MM' })
  @IsString()
  @IsNotEmpty()
  startTime!: string;

  @ApiProperty({ example: '11:00', description: '24-hour HH:MM' })
  @IsString()
  @IsNotEmpty()
  endTime!: string;

  @ApiProperty({ example: 4 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  visitorCount!: number;

  @ApiPropertyOptional({
    type: [VisitorDto],
    description:
      'Named visitors, when the group is small enough to list individually.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VisitorDto)
  visitors?: VisitorDto[];

  @ApiPropertyOptional({
    description:
      'URL of an uploaded visitor list, once StorageModule (Supabase Storage) is wired up.',
  })
  @IsOptional()
  @IsString()
  visitorListUrl?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  bringingVehicle?: boolean;

  @ApiPropertyOptional({ example: 'ABC 1234' })
  @IsOptional()
  @IsString()
  plateNumber?: string;

  @ApiPropertyOptional({ example: 'Toyota' })
  @IsOptional()
  @IsString()
  carBrand?: string;

  @ApiPropertyOptional({ example: 'Van, Sedan, School Bus' })
  @IsOptional()
  @IsString()
  carType?: string;

  @ApiPropertyOptional({ example: 'Cameras, notebooks, recording gear' })
  @IsOptional()
  @IsString()
  equipment?: string;

  @ApiPropertyOptional({ example: 'Anything else we should know' })
  @IsOptional()
  @IsString()
  notes?: string;
}
