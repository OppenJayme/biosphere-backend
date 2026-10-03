import { PickType } from '@nestjs/swagger';
import { CreateExhibitDto } from './create-exhibit.dto';

// Intentionally replaces the public URL (REQ-4.12-10). Every QR code printed
// for the old URL stops working and shows the unavailable state.
export class ReplaceExhibitUrlDto extends PickType(CreateExhibitDto, [
  'publicSlug',
] as const) {}
