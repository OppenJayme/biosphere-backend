import { PartialType } from '@nestjs/swagger';
import { CreateSpecimenTaxonomyDto } from './create-specimen-taxonomy.dto';

export class UpdateSpecimenTaxonomyDto extends PartialType(
  CreateSpecimenTaxonomyDto,
) {}
