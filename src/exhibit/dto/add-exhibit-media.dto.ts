import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

// The actual file is sent as multipart form-data alongside this DTO
// (see ExhibitsController#addMedia, field name "file").
export class AddExhibitMediaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  caption?: string;

  // Multipart fields arrive as strings, so numeric/boolean fields need an
  // explicit transform rather than relying on ValidationPipe's implicit
  // conversion (see CreateArAssetDto for the same pattern).
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isCover?: boolean = false;
}
