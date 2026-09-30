import { ApiProperty } from '@nestjs/swagger';

export class StorageLocationPathSegment {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  unitType!: string;
}

/**
 * Location derived from the storage hierarchy (REQ-4.6-08) so the room or
 * gallery is never stored separately from the assigned unit.
 */
export class StorageLocationSummary {
  @ApiProperty({
    type: [StorageLocationPathSegment],
    description: 'Units from the top-level room or gallery down to this unit',
  })
  path!: StorageLocationPathSegment[];

  @ApiProperty({
    type: StorageLocationPathSegment,
    description: 'Top-level unit of the path, normally the room or gallery',
  })
  rootUnit!: StorageLocationPathSegment;

  @ApiProperty({ example: 'Zoology Room › Cabinet A › Drawer 3' })
  pathLabel!: string;
}
