import { ApiProperty } from '@nestjs/swagger';
import { Specimen } from '../../specimens/entities/specimen.entity';

export class OfflineSpecimenDraftSyncResult {
  @ApiProperty()
  clientDraftId!: string;

  @ApiProperty({
    description: 'True when this draft had already been accepted earlier',
  })
  alreadySynchronized!: boolean;

  @ApiProperty({ type: Specimen })
  specimen!: Specimen;
}
