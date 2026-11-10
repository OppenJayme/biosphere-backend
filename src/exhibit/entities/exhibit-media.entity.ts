import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExhibitMedia {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  exhibitId!: string;

  @ApiProperty({
    description: 'Storage path within the exhibit-media bucket',
  })
  mediaUrl!: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Short-lived signed URL for previewing the image in the curator app',
  })
  previewUrl?: string | null;

  @ApiProperty({ default: 0 })
  displayOrder!: number;

  @ApiPropertyOptional({ nullable: true })
  caption!: string | null;

  @ApiProperty({ default: false })
  isCover!: boolean;
}

export class PublicExhibitMedia {
  @ApiProperty({ description: 'Short-lived visitor URL for the media file' })
  mediaUrl!: string;

  @ApiProperty({ default: 0 })
  displayOrder!: number;

  @ApiPropertyOptional({ nullable: true })
  caption!: string | null;

  @ApiProperty({ default: false })
  isCover!: boolean;
}
