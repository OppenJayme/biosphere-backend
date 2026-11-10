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

export class ChangeSpecimenTagResult {
  @ApiProperty({ type: Tag, description: 'The tag now attached' })
  tag!: Tag;

  @ApiProperty({ description: 'The tag id that was replaced' })
  previousTagId!: string;

  @ApiProperty({
    description:
      'False when the new name resolves to the same tag and nothing changed',
  })
  changed!: boolean;
}
