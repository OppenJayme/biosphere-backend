import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { normalizeTagName, TAG_NAME_PATTERN } from './tag-name.transform';

export class AttachSpecimenTagDto {
  @ApiProperty({
    example: 'Endemic',
    maxLength: 100,
    description:
      'Curator-extensible tag name. Matching ignores case but preserves the first stored spelling.',
  })
  @Transform(normalizeTagName)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(TAG_NAME_PATTERN, {
    message: 'tagName must not contain control characters',
  })
  tagName!: string;
}
