import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDefined, IsUUID, ValidateNested } from 'class-validator';
import { CreateSpecimenDto } from '../../specimens/dto/create-specimen.dto';

export class SyncSpecimenDraftDto {
  @ApiProperty({
    description:
      'Stable UUID generated once when the browser creates the draft',
  })
  @IsUUID()
  clientDraftId!: string;

  @ApiProperty({
    type: CreateSpecimenDto,
    description: 'Text-only Uncataloged specimen data saved by the curator',
  })
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateSpecimenDto)
  draft!: CreateSpecimenDto;
}
