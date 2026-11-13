import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

// Stored as one visit_request_vehicle row. The limits are tighter than the
// columns (20/100/100): Philippine plates are about 7 characters, and 40 is
// plenty for a brand or a type such as "School Bus".
export class VehicleDto {
  @ApiProperty({ example: 'ABC 1234', maxLength: 15 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(15)
  plateNumber!: string;

  @ApiPropertyOptional({ example: 'Toyota', maxLength: 40 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  carBrand?: string;

  @ApiPropertyOptional({ example: 'Van', maxLength: 40 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  carType?: string;
}
