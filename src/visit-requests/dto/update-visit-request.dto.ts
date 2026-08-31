import { PartialType } from '@nestjs/swagger';
import { CreateVisitRequestDto } from './create-visit-request.dto';

export class UpdateVisitRequestDto extends PartialType(CreateVisitRequestDto) {}
