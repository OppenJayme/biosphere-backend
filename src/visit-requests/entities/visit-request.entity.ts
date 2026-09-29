import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Mirrors the visit_request_status database enum (SRS REQ-4.9-09).
export enum VisitRequestStatus {
  PENDING = 'PENDING',
  APPROVED_BY_CURATOR = 'APPROVED_BY_CURATOR',
  SUBMITTED_FOR_CAMPUS_ENTRY = 'SUBMITTED_FOR_CAMPUS_ENTRY',
  DECLINED = 'DECLINED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

// Returned to the public submitter. Deliberately echoes no personal data.
export class VisitRequestSubmissionReceipt {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: VisitRequestStatus })
  status!: VisitRequestStatus;

  @ApiProperty()
  submittedAt!: Date;
}

export class PreferredSchedule {
  @ApiProperty({ example: '2026-10-15' })
  date!: string;

  @ApiProperty({ example: '09:00' })
  startTime!: string;

  @ApiProperty({ example: '11:00' })
  endTime!: string;

  @ApiProperty({ description: '1 = most preferred' })
  preferenceOrder!: number;
}

export class ApprovedSchedule {
  @ApiProperty({ example: '2026-10-15' })
  date!: string;

  @ApiProperty({ example: '09:00' })
  startTime!: string;

  @ApiProperty({ example: '11:00' })
  endTime!: string;
}

export class VisitRequestVisitor {
  @ApiProperty()
  name!: string;
}

export class VisitRequestVehicle {
  @ApiPropertyOptional({ nullable: true })
  plateNumber!: string | null;

  @ApiPropertyOptional({ nullable: true })
  brand!: string | null;

  @ApiPropertyOptional({ nullable: true })
  type!: string | null;
}

// Curator-only view of a stored visit request.
export class VisitRequest {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty()
  organization!: string;

  @ApiPropertyOptional({ nullable: true })
  address!: string | null;

  @ApiPropertyOptional({ nullable: true })
  purpose!: string | null;

  @ApiProperty()
  visitorCount!: number;

  @ApiProperty({ type: [PreferredSchedule] })
  preferredSchedules!: PreferredSchedule[];

  @ApiPropertyOptional({
    type: ApprovedSchedule,
    nullable: true,
    description: 'The preferred option the curator approved, if any',
  })
  approvedSchedule!: ApprovedSchedule | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Inquiry this request was referred from, if any',
  })
  sourceInquiryId!: string | null;

  @ApiProperty({ type: [VisitRequestVisitor] })
  visitors!: VisitRequestVisitor[];

  @ApiProperty({ type: [VisitRequestVehicle] })
  vehicles!: VisitRequestVehicle[];

  @ApiPropertyOptional({ nullable: true })
  equipment!: string | null;

  @ApiPropertyOptional({ nullable: true })
  notes!: string | null;

  @ApiProperty({ enum: VisitRequestStatus })
  status!: VisitRequestStatus;

  @ApiProperty()
  consentAcceptedAt!: Date;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Account id of the curator who last changed the status',
  })
  reviewedBy!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

// Consolidated approved visit details the curator copies into the external
// USC campus-entry process (REQ-4.9-12). BioSphere never submits it itself
// (REQ-4.9-13).
export class CampusEntrySummary {
  @ApiProperty()
  visitRequestId!: string;

  @ApiProperty({ enum: VisitRequestStatus })
  status!: VisitRequestStatus;

  @ApiProperty()
  organization!: string;

  @ApiProperty()
  contactPerson!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  phone!: string;

  @ApiPropertyOptional({ nullable: true })
  purpose!: string | null;

  @ApiProperty({ type: ApprovedSchedule })
  approvedSchedule!: ApprovedSchedule;

  @ApiProperty()
  visitorCount!: number;

  @ApiProperty({ type: [VisitRequestVisitor] })
  visitors!: VisitRequestVisitor[];

  @ApiProperty({ type: [VisitRequestVehicle] })
  vehicles!: VisitRequestVehicle[];

  @ApiPropertyOptional({ nullable: true })
  equipment!: string | null;
}
