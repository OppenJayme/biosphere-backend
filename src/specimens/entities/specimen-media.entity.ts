import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SpecimenMedia {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  specimenId!: string;

  @ApiProperty({ description: 'Private Supabase Storage object path' })
  storagePath!: string;

  @ApiProperty({ minimum: 0 })
  displayOrder!: number;

  @ApiPropertyOptional({ nullable: true })
  caption!: string | null;

  @ApiProperty()
  isCover!: boolean;

  @ApiProperty()
  createdAt!: Date;
}

export class SpecimenMediaSignedUrl {
  @ApiProperty()
  mediaId!: string;

  @ApiProperty()
  signedUrl!: string;

  @ApiProperty({ description: 'Signed URL lifetime in seconds' })
  expiresIn!: number;
}

export class RemoveSpecimenMediaResult {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: [true] })
  removed!: true;

  @ApiProperty({
    description:
      'True when database removal succeeded but the private storage object requires later cleanup',
  })
  storageCleanupPending!: boolean;
}

export class ReplaceSpecimenMediaResult {
  @ApiProperty({ type: SpecimenMedia })
  media!: SpecimenMedia;

  @ApiProperty({
    description:
      'True when the new image is active but the previous private object requires later cleanup',
  })
  previousStorageCleanupPending!: boolean;
}
