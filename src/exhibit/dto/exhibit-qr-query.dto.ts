import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ExhibitQrQueryDto {
  @ApiPropertyOptional({ enum: ['png', 'svg'], default: 'png' })
  @IsOptional()
  @IsIn(['png', 'svg'])
  format?: 'png' | 'svg';

  @ApiPropertyOptional({
    minimum: 128,
    maximum: 2048,
    default: 1024,
    description: 'PNG width and height in pixels (ignored for SVG)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(128)
  @Max(2048)
  size?: number;
}
