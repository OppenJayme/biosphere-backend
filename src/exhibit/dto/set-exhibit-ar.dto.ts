import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

// Curator on/off switch for an exhibit's uploaded AR assets (REQ-4.13-02).
// Only an exhibit marked for AR preparation (SetExhibitArSelectionDto) can
// be switched on. BioSphere never scores or ranks specimens for AR
// (REQ-4.13-08).
export class SetExhibitArDto {
  @ApiProperty({
    description:
      'true enables every uploaded AR asset (View in AR shows); false disables them (View in AR hides)',
  })
  @IsBoolean()
  enabled!: boolean;
}
