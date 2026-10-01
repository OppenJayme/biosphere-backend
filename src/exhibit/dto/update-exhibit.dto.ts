import { OmitType, PartialType } from '@nestjs/swagger';
import type { PublicSpecimenField } from '../exhibit-public-fields';
import { CreateExhibitDto } from './create-exhibit.dto';
import { PublicSpecimenFieldsProperty } from './public-specimen-fields.decorator';

// specimenId is intentionally excluded — an exhibit is not re-parented to a
// different specimen through the general update route (mirrors
// UpdateStorageUnitDto's treatment of parentId). publicSlug is excluded too:
// editing content keeps the public URL and printed QR codes stable
// (REQ-4.12-10); changing it is the separate replace-url action.
// publicSpecimenFields is declared here rather than inherited: PartialType
// marks inherited fields IsOptional, which would let null through and clear
// the selection.
export class UpdateExhibitDto extends PartialType(
  OmitType(CreateExhibitDto, [
    'specimenId',
    'publicSlug',
    'publicSpecimenFields',
  ] as const),
) {
  @PublicSpecimenFieldsProperty()
  publicSpecimenFields?: PublicSpecimenField[];
}
