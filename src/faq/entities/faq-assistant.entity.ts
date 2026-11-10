import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const FAQ_ASSISTANT_NOTICE =
  'Answers are limited to curator-approved museum information. The assistant cannot approve visits or process campus entry.';

export const FAQ_AI_NOTICE =
  'Some answers are reworded by AI from approved museum FAQs; check the linked FAQ for the exact wording.';

export const FAQ_NO_MATCH_MESSAGE =
  'No approved answer is available for that question. Please send it through the General Inquiry form so a curator can respond.';

export const FAQ_CLARIFICATION_MESSAGE =
  'More than one approved question matches. Which one did you mean?';

export const FAQ_CONTEXT_MESSAGE =
  'I could not find an approved answer for that follow-up. Please ask a complete museum question, choose an approved FAQ, or send a General Inquiry.';

export const FAQ_VISIT_REQUEST_MESSAGE =
  'The assistant cannot submit, approve, change, or cancel Visit Requests. To request a visit, use the Visit Request form. To follow up on, change, or cancel a request you already sent, send a General Inquiry with your reference number.';

export enum FaqAssistantOutcome {
  ANSWERED = 'ANSWERED',
  CLARIFICATION_NEEDED = 'CLARIFICATION_NEEDED',
  NO_MATCH = 'NO_MATCH',
  VISIT_REQUEST_REDIRECT = 'VISIT_REQUEST_REDIRECT',
  SMALL_TALK = 'SMALL_TALK',
}

export enum FaqAssistantRedirect {
  GENERAL_INQUIRY = 'GENERAL_INQUIRY',
  VISIT_REQUEST = 'VISIT_REQUEST',
}

// Deliberately narrower than FaqEntry: no lifecycle, attribution, or matching
// metadata reaches the public site (REQ-4.11-07, NFR-SEC-08).
export class PublicFaqQuestion {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  question!: string;

  @ApiPropertyOptional({ nullable: true })
  category!: string | null;
}

export class PublicFaqAnswer extends PublicFaqQuestion {
  @ApiProperty({ description: 'Stored curator-approved answer text' })
  answer!: string;
}

export class FaqAssistantResponse {
  @ApiProperty({ enum: FaqAssistantOutcome })
  outcome!: FaqAssistantOutcome;

  @ApiPropertyOptional({ type: PublicFaqAnswer, nullable: true })
  answer!: PublicFaqAnswer | null;

  @ApiProperty({ type: [PublicFaqQuestion] })
  related!: PublicFaqQuestion[];

  @ApiPropertyOptional({ nullable: true })
  message!: string | null;

  @ApiPropertyOptional({ enum: FaqAssistantRedirect, nullable: true })
  redirect!: FaqAssistantRedirect | null;

  @ApiProperty({
    description:
      'True when the answer text was reworded by the optional AI layer from the listed approved sources.',
  })
  assisted!: boolean;

  @ApiProperty({
    type: [PublicFaqQuestion],
    description: 'Approved FAQ entries an AI-assisted answer was based on.',
  })
  sources!: PublicFaqQuestion[];

  @ApiProperty({ example: FAQ_ASSISTANT_NOTICE })
  notice!: string;
}

export class FaqSuggestionList {
  @ApiProperty({ type: [PublicFaqQuestion] })
  items!: PublicFaqQuestion[];

  @ApiProperty({ example: FAQ_ASSISTANT_NOTICE })
  notice!: string;
}
