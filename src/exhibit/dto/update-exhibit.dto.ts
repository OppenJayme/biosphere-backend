import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateExhibitDto } from './create-exhibit.dto';

// specimenId is intentionally excluded — an exhibit is not re-parented to a
// different specimen through the general update route (mirrors
// UpdateStorageUnitDto's treatment of parentId). publicSlug is excluded too:
// editing content keeps the public URL and printed QR codes stable
// (REQ-4.12-10); changing it is the separate replace-url action.
export class UpdateExhibitDto extends PartialType(
  OmitType(CreateExhibitDto, ['specimenId', 'publicSlug'] as const),
) {}
