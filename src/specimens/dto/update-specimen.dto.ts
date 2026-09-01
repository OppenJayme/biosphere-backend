// src/specimens/dto/update-specimen.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateSpecimenDto } from './create-specimen.dto';

export class UpdateSpecimenDto extends PartialType(CreateSpecimenDto) {}