import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

// Stored as one visit_request_vehicle row.
export class VehicleDto {
  @ApiProperty({ example: 'ABC 1234', maxLength: 20 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  plateNumber!: string;

  @ApiPropertyOptional({ example: 'Toyota', maxLength: 100 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  carBrand?: string;

  @ApiPropertyOptional({ example: 'Van', maxLength: 100 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  carType?: string;
}
