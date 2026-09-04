import { PartialType } from '@nestjs/swagger';
import { CreateSpecimenDto } from './create-specimen.dto';

export class UpdateSpecimenDto extends PartialType(CreateSpecimenDto) {}