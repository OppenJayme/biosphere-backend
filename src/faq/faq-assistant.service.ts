import { Injectable } from '@nestjs/common';
import { faq_status } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AskFaqAssistantDto } from './dto/ask-faq-assistant.dto';
import { ListFaqSuggestionsQueryDto } from './dto/list-faq-suggestions-query.dto';
import {
  FAQ_ASSISTANT_NOTICE,
  FAQ_NO_MATCH_MESSAGE,
  FAQ_VISIT_REQUEST_MESSAGE,
  FaqAssistantOutcome,
  FaqAssistantRedirect,
  FaqAssistantResponse,
  FaqSuggestionList,
  PublicFaqQuestion,
} from './entities/faq-assistant.entity';
import { isVisitRequestTransaction, matchFaqEntries } from './faq-matcher';

const PUBLIC_QUESTION_SELECT = {
  id: true,
  question: true,
  category: true,
} as const;

/**
 * Public, read-only FAQ Assistant. It reads only ACTIVE entries, never writes
 * (no question, IP, or audit row is stored), and returns only stored curator
 * text — unmatched questions fall back to General Inquiry (BR-18).
 */
@Injectable()
export class FaqAssistantService {
  constructor(private readonly prisma: PrismaService) {}

  async suggestions(
    query: ListFaqSuggestionsQueryDto,
  ): Promise<FaqSuggestionList> {
    const items = await this.prisma.faq_entry.findMany({
      where: { status: faq_status.ACTIVE },
      select: PUBLIC_QUESTION_SELECT,
      orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
      take: query.limit,
    });
    return {
      items: items.map((item) => this.toPublicQuestion(item)),
      notice: FAQ_ASSISTANT_NOTICE,
    };
  }

  async ask(dto: AskFaqAssistantDto): Promise<FaqAssistantResponse> {
    const activeEntries = await this.prisma.faq_entry.findMany({
      where: { status: faq_status.ACTIVE },
      select: {
        ...PUBLIC_QUESTION_SELECT,
        answer: true,
        alternative_wording: true,
        keywords: true,
      },
    });
    const candidates = activeEntries.map((entry) => ({
      ...entry,
      alternativeWording: entry.alternative_wording,
    }));

    const { best, related } = matchFaqEntries(dto.question, candidates);
    const visitTransaction = isVisitRequestTransaction(dto.question);
    const relatedQuestions = related.map(({ entry }) =>
      this.toPublicQuestion(entry),
    );

    if (best) {
      return {
        outcome: FaqAssistantOutcome.ANSWERED,
        answer: {
          ...this.toPublicQuestion(best.entry),
          answer: best.entry.answer,
        },
        related: relatedQuestions,
        message: visitTransaction ? FAQ_VISIT_REQUEST_MESSAGE : null,
        redirect: visitTransaction ? FaqAssistantRedirect.VISIT_REQUEST : null,
        notice: FAQ_ASSISTANT_NOTICE,
      };
    }

    return {
      outcome: visitTransaction
        ? FaqAssistantOutcome.VISIT_REQUEST_REDIRECT
        : FaqAssistantOutcome.NO_MATCH,
      answer: null,
      related: relatedQuestions,
      message: visitTransaction
        ? FAQ_VISIT_REQUEST_MESSAGE
        : FAQ_NO_MATCH_MESSAGE,
      redirect: visitTransaction
        ? FaqAssistantRedirect.VISIT_REQUEST
        : FaqAssistantRedirect.GENERAL_INQUIRY,
      notice: FAQ_ASSISTANT_NOTICE,
    };
  }

  private toPublicQuestion(entry: {
    id: string;
    question: string;
    category: string | null;
  }): PublicFaqQuestion {
    return { id: entry.id, question: entry.question, category: entry.category };
  }
}
