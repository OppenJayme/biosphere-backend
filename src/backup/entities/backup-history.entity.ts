/** Public API shapes for internal backup execution history. */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum BackupStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum BackupCreatorRole {
  CURATOR = 'CURATOR',
  DEVELOPER = 'DEVELOPER',
}

export class BackupCreator {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ enum: BackupCreatorRole })
  role!: BackupCreatorRole;
}

export class BackupHistoryEntry {
  @ApiProperty()
  id!: string;

  @ApiPropertyOptional({ type: BackupCreator, nullable: true })
  creator!: BackupCreator | null;

  @ApiProperty()
  backupType!: string;

  @ApiProperty({ enum: BackupStatus })
  status!: BackupStatus;

  @ApiProperty({
    description:
      'Whether the execution recorded an internal storage artifact; its path is not exposed',
  })
  artifactAvailable!: boolean;

  @ApiProperty()
  startedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  completedAt!: Date | null;
}

export class BackupHistoryPage {
  @ApiProperty({ type: [BackupHistoryEntry] })
  items!: BackupHistoryEntry[];

  @ApiProperty({ minimum: 0 })
  total!: number;

  @ApiProperty({ minimum: 1 })
  page!: number;

  @ApiProperty({ minimum: 1, maximum: 100 })
  limit!: number;
}
