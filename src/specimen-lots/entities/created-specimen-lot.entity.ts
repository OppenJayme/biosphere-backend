import { ApiProperty } from '@nestjs/swagger';
import { StorageCapacityWarning } from '../../storage-locations/entities/storage-capacity.entity';
import { SpecimenLot } from './specimen-lot.entity';

export class CreatedSpecimenLot extends SpecimenLot {
  @ApiProperty({
    type: StorageCapacityWarning,
    nullable: true,
    description:
      'Present when the storage unit now exceeds its configured capacity; the lot is still created',
  })
  capacityWarning!: StorageCapacityWarning | null;
}
