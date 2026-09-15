import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { trimString } from '../../common/transforms/trim-string.transform';

export class UpdateSpecimenLotNotesDto {
  @ApiProperty({ nullable: true })
  @Transform(trimString)
  @IsDefined()
  @ValidateIf((_object, value: unknown) => value !== null)
  @IsString()
  @IsNotEmpty()
  storageNotes!: string | null;
}
