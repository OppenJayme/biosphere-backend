import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

export class CreateSpecimenLotDto {
  @ApiProperty({ description: 'Active storage unit that can hold specimens' })
  @IsUUID()
  storageUnitId!: string;

  @ApiProperty({ description: 'Curator-managed condition classification' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: 'conditionClass must contain visible text' })
  conditionClass!: string;

  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  quantity!: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  storageNotes?: string | null;

  @ApiPropertyOptional({
    description: 'Optional context for the initial quantity addition',
    nullable: true,
  })
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  reason?: string | null;
}
