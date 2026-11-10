import { applyDecorators } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsIn, ValidateIf } from 'class-validator';
import { PUBLIC_SPECIMEN_FIELDS } from '../exhibit-public-fields';

// Validation for publicSpecimenFields (REQ-4.12-03), shared by the create and
// update DTOs. ValidateIf rather than IsOptional, so an explicit null is
// rejected instead of being saved as an empty selection: the value is always
// a list of allowlisted keys, possibly empty.
export function PublicSpecimenFieldsProperty() {
  return applyDecorators(
    ApiPropertyOptional({
      enum: PUBLIC_SPECIMEN_FIELDS,
      isArray: true,
      example: ['commonName', 'scientificName', 'family', 'habitat'],
      description:
        'Specimen fields to show on the public page, from the approved list only. Defaults to all of them on create; an empty list shows none. Exhibit content and images are not part of it.',
    }),
    ValidateIf((_object, value) => value !== undefined),
    IsArray(),
    ArrayUnique(),
    IsIn(PUBLIC_SPECIMEN_FIELDS, {
      each: true,
      message: `each value in publicSpecimenFields must be one of: ${PUBLIC_SPECIMEN_FIELDS.join(', ')}`,
    }),
  );
}
