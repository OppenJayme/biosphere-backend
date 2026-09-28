import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';
import { PreferredScheduleDto } from './preferred-schedule.dto';
import { VisitorDto } from './visitor.dto';

export const MAX_PREFERRED_SCHEDULES = 5;
export const MAX_VISITOR_COUNT = 200;

// Public Request-a-Visit form (SRS REQ-4.9-01 to 06). Limits follow the
// visit_request and child-table column sizes.
export class CreateVisitRequestDto {
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

  @ApiProperty({ example: '0917 123 4567', maxLength: 20 })
  @Transform(trimString)
  @IsString()
  @Matches(/^[0-9+()\-\s]{7,20}$/, {
    message: 'phone must be 7-20 digits, spaces, or + ( ) - characters',
  })
  phone!: string;

  @ApiProperty({ example: 'University of San Carlos', maxLength: 255 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  organization!: string;

  @ApiPropertyOptional({ example: 'Talamban, Cebu City', maxLength: 255 })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  address?: string;

  @ApiProperty({ example: 'Class field trip', maxLength: 1000 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  purpose!: string;

  @ApiProperty({
    type: [PreferredScheduleDto],
    minItems: 1,
    maxItems: MAX_PREFERRED_SCHEDULES,
    description: 'Preferred options in order of preference',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PREFERRED_SCHEDULES)
  @ValidateNested({ each: true })
  @Type(() => PreferredScheduleDto)
  preferredSchedules!: PreferredScheduleDto[];

  @ApiProperty({ example: 20, minimum: 1, maximum: MAX_VISITOR_COUNT })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_VISITOR_COUNT)
  visitorCount!: number;

  @ApiPropertyOptional({
    type: [VisitorDto],
    description: 'Named visitors; at most visitorCount entries',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_VISITOR_COUNT)
  @ValidateNested({ each: true })
  @Type(() => VisitorDto)
  visitors?: VisitorDto[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  bringingVehicle?: boolean;

  @ApiPropertyOptional({
    example: 'ABC 1234',
    maxLength: 20,
    description: 'Required when bringingVehicle is true',
  })
  @ValidateIf(
    (dto: CreateVisitRequestDto) =>
      dto.bringingVehicle === true || dto.plateNumber !== undefined,
  )
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  plateNumber?: string;

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

  @ApiPropertyOptional({
    example: 'Cameras, notebooks, recording gear',
    maxLength: 500,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  equipment?: string;

  @ApiPropertyOptional({
    example: 'Anything else we should know',
    maxLength: 1000,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({
    example: true,
    description: 'Visitor accepted the approved privacy notice (must be true)',
  })
  @IsBoolean()
  @Equals(true, { message: 'The privacy notice must be accepted.' })
  consentAccepted!: boolean;
}
