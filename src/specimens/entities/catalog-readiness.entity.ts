import { ApiProperty } from '@nestjs/swagger';
import { SpecimenStatus } from './specimen.entity';

/** Public API shape for explaining catalog-completion eligibility. */
export class CatalogRequirementCheck {
  @ApiProperty()
  key!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  passed!: boolean;
}

export class CatalogReadiness {
  @ApiProperty()
  specimenId!: string;

  @ApiProperty({ enum: SpecimenStatus })
  currentStatus!: SpecimenStatus;

  @ApiProperty({
    description: 'True when every approved catalog-content rule passes',
  })
  requirementsMet!: boolean;

  @ApiProperty({
    description:
      'True only when requirements pass and the record is currently Uncataloged',
  })
  canComplete!: boolean;

  @ApiProperty({ type: [CatalogRequirementCheck] })
  checks!: CatalogRequirementCheck[];

  @ApiProperty({ type: [String] })
  missingRequirements!: string[];
}
