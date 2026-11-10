import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const DEFAULT_NOTIFICATION_LIMIT = 20;
export const MAX_NOTIFICATION_LIMIT = 100;

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_NOTIFICATION_LIMIT,
    minimum: 1,
    maximum: MAX_NOTIFICATION_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_NOTIFICATION_LIMIT)
  limit?: number;
}
