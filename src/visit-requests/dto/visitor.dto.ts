import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

// Stored as one visit_request_visitor.visitor_name (max 100 characters).
// Campus entry needs each visitor's full name, so both parts are required.
export class VisitorDto {
  @ApiProperty({ example: 'Juan', maxLength: 50 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  firstName!: string;

  @ApiProperty({ example: 'Dela Cruz', maxLength: 49 })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(49)
  lastName!: string;
}
