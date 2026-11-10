import { ApiProperty } from '@nestjs/swagger';
import { Specimen } from './specimen.entity';

/** Restored core record plus the server's current Cataloging assessment. */
export class SpecimenRestoreResult extends Specimen {
  @ApiProperty({
    description:
      'False for an already-active record; retries do not change it.',
  })
  restored!: boolean;

  @ApiProperty({ type: [String] })
  missingRequirements!: string[];
}
