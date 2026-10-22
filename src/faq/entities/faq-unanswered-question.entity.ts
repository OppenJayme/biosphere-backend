import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * One distinct unanswered wording (grouped by normalized text) so a curator
 * sees how often visitors asked it, not one row per ask.
 */
export class FaqUnansweredQuestion {
  @ApiProperty({ description: 'Most recent log row for this wording' })
  id!: string;

  @ApiProperty({ description: 'Most recent wording as the visitor typed it' })
  question!: string;

  @ApiProperty({ description: 'NO_MATCH or CLARIFY on the most recent ask' })
  outcome!: string;

  @ApiProperty()
  timesAsked!: number;

  @ApiProperty()
  firstAskedAt!: Date;

  @ApiProperty()
  lastAskedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  reviewedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true })
  reviewedByName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  faqEntryId!: string | null;
}

export class FaqUnansweredQuestionPage {
  @ApiProperty({ type: [FaqUnansweredQuestion] })
  items!: FaqUnansweredQuestion[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty({ description: 'Days a logged question is kept' })
  retentionDays!: number;
}
