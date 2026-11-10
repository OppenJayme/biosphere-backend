import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

// Edits an existing exhibit image (REQ-4.12-03). Sent as JSON, unlike the
// multipart upload.
export class UpdateExhibitMediaDto {
  @ApiPropertyOptional({ nullable: true, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  caption?: string | null;

  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({
    description: 'true makes this the cover image; other images lose cover',
  })
  @IsOptional()
  @IsBoolean()
  isCover?: boolean;
}
