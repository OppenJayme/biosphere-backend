import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Curator marks or unmarks an exhibit for AR preparation (REQ-4.13-02).
// Selection is at the curator's discretion; the note is free text for the
// developer and is never scored or ranked (REQ-4.13-08).
export class SetExhibitArSelectionDto {
  @ApiProperty({
    description:
      'true marks the exhibit for AR preparation so a developer can deploy AR assets to it; false withdraws the selection and turns off any active AR',
  })
  @IsBoolean()
  selected!: boolean;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: 1000,
    example:
      'Endemic species used in the Grade 7 biodiversity tour; conservation status Endangered.',
    description:
      "Curator's reason for the selection, e.g. its research or educational objective, conservation status, rarity, endemism, exotic or invasive status, or economic or ecological value. Ignored when selected is false.",
  })
  // A blank note is stored as no note.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note?: string | null;
}
