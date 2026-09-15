import { ApiProperty } from '@nestjs/swagger';

export class Tag {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class AttachSpecimenTagResult {
  @ApiProperty({ type: Tag })
  tag!: Tag;

  @ApiProperty({
    description:
      'False when the tag was already attached and the request completed idempotently',
  })
  attached!: boolean;
}

export class DetachSpecimenTagResult {
  @ApiProperty()
  tagId!: string;

  @ApiProperty({ enum: [true] })
  detached!: true;
}
