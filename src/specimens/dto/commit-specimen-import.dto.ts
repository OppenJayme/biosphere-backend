import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsInt,
  IsOptional,
  IsUUID,
  Min,
} from 'class-validator';

export const MAX_IMPORT_ROWS = 500;

export class CommitSpecimenImportDto {
  @ApiProperty({
    description:
      'previewId returned by a preceding POST /specimens/import/preview call',
  })
  @IsUUID()
  previewId!: string;

  @ApiPropertyOptional({
    description:
      'Row numbers to commit from that preview. Omit to commit every row the preview marked valid.',
    type: [Number],
  })
  @IsOptional()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_IMPORT_ROWS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  rowNumbers?: number[];
}
