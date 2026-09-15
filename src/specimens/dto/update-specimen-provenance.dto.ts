import { PartialType } from '@nestjs/swagger';
import { CreateSpecimenProvenanceDto } from './create-specimen-provenance.dto';

export class UpdateSpecimenProvenanceDto extends PartialType(
  CreateSpecimenProvenanceDto,
) {}
