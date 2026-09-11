import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateExhibitDto } from './create-exhibit.dto';

// specimenId is intentionally excluded — an exhibit is not re-parented to a
// different specimen through the general update route (mirrors
// UpdateStorageUnitDto's treatment of parentId).
export class UpdateExhibitDto extends PartialType(
  OmitType(CreateExhibitDto, ['specimenId'] as const),
) {}
