import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateNotificationStateDto {
  @ApiProperty({
    description: 'An active notification key from this curator feed',
  })
  @IsString()
  @MaxLength(180)
  @Matches(
    /^(NEW_INQUIRY|NEW_VISIT_REQUEST|SUBMISSION_EMAIL_FAILED|VISITOR_REPLY|SYNC_FAILED|BACKUP_FAILED|REPORT_FAILED|SPECIMEN_ARCHIVED|SPECIMEN_RESTORED|LOT_MOVED|LOT_DEACCESSIONED|LOT_MISSING_LOSS|RECORD_INCOMPLETE):[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/,
  )
  notificationId!: string;

  @ApiProperty({ enum: ['READ', 'DISMISSED'] })
  @IsIn(['READ', 'DISMISSED'])
  state!: 'READ' | 'DISMISSED';
}
