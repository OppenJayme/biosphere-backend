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

  @ApiProperty({ default: 0 })
  displayOrder!: number;

  @ApiPropertyOptional({ nullable: true })
  caption!: string | null;

  @ApiProperty({ default: false })
  isCover!: boolean;
}
