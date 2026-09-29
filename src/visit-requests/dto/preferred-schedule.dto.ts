import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

const DATE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// One preferred visit option (REQ-4.9-02/03). Calendar validity, past
// dates, and end-after-start are checked in VisitRequestsService.
export class PreferredScheduleDto {
  @ApiProperty({ example: '2026-10-15', description: 'YYYY-MM-DD' })
  @Matches(DATE_PATTERN, { message: 'date must be in YYYY-MM-DD format' })
  date!: string;

  @ApiProperty({ example: '09:00', description: '24-hour HH:MM' })
  @Matches(TIME_PATTERN, { message: 'startTime must be 24-hour HH:MM' })
  startTime!: string;

  @ApiProperty({ example: '11:00', description: '24-hour HH:MM' })
  @Matches(TIME_PATTERN, { message: 'endTime must be 24-hour HH:MM' })
  endTime!: string;
}
