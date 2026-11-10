import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum AuditResult {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  DENIED = 'DENIED',
}

export enum AuditActorRole {
  CURATOR = 'CURATOR',
  DEVELOPER = 'DEVELOPER',
}

export class AuditActor {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: AuditActorRole })
  role!: AuditActorRole;
}

export class AuditLogEntry {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ type: AuditActor, nullable: true })
  actor!: AuditActor | null;

  @ApiPropertyOptional({ nullable: true })
  affectedRecordId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  affectedRecordType!: string | null;

  @ApiProperty()
  action!: string;

  @ApiProperty()
  module!: string;

  @ApiPropertyOptional({
    type: Object,
    nullable: true,
    description: 'Event-specific structured metadata',
  })
  details!: unknown;

  @ApiProperty({ enum: AuditResult })
  result!: AuditResult;

  @ApiProperty()
  createdAt!: Date;
}

export class AuditLogPage {
  @ApiProperty({ type: [AuditLogEntry] })
  items!: AuditLogEntry[];

  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  limit!: number;
}
