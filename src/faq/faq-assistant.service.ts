import { Injectable } from '@nestjs/common';
import { faq_status } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AskFaqAssistantDto } from './dto/ask-faq-assistant.dto';
import { ListFaqSuggestionsQueryDto } from './dto/list-faq-suggestions-query.dto';
import {
  FAQ_ASSISTANT_NOTICE,
  FAQ_CLARIFICATION_MESSAGE,
  FAQ_CONTEXT_MESSAGE,
  FAQ_NO_MATCH_MESSAGE,
  FAQ_VISIT_REQUEST_MESSAGE,
  FaqAssistantOutcome,
  FaqAssistantRedirect,
  FaqAssistantResponse,
  FaqSuggestionList,
  PublicFaqQuestion,
} from './entities/faq-assistant.entity';
import {
  isVisitRequestChange,
  isVisitRequestTransaction,
  matchFaqEntries,
  normalizeFaqText,
  tokenizeFaqText,
  type FaqMatchResult,
} from './faq-matcher';

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

    // IDs are public references, not authorization: always recheck ACTIVE status.
    // A stale/unknown choice must not silently answer from a different entry.
    const selected = dto.selectedFaqId
      ? candidates.find((entry) => entry.id === dto.selectedFaqId)
      : undefined;
    const followup = normalizeFaqText(dto.question).match(
      /^(?:how|what) about(?: (.*))?$/,
    );
    let match: FaqMatchResult<(typeof candidates)[number]>;
    if (dto.selectedFaqId) {
      match = {
        best: selected ? { entry: selected, score: 1 } : null,
        related: [],
      };
    } else if (followup) {
      const context = candidates.find((entry) => entry.id === dto.contextFaqId);
      const qualifiers = tokenizeFaqText(followup[1] ?? '');
      const topic = context ? tokenizeFaqText(context.question) : [];
      // Context is a public hint, not authority. Require approved vocabulary
      // for every meaningful qualifier and some evidence of the prior topic.
      const contextualCandidates =
        context && qualifiers.length && topic.length
          ? candidates.filter((entry) => {
              const vocabulary = new Set(
                [
                  entry.question,
                  ...entry.alternativeWording,
                  ...entry.keywords,
                ].flatMap(tokenizeFaqText),
              );
              return (
                qualifiers.every((token) => vocabulary.has(token)) &&
                topic.some((token) => vocabulary.has(token))
              );
            })
          : [];
      match = context
        ? matchFaqEntries(
            `${context.question} ${followup[1] ?? ''}`,
            contextualCandidates,
          )
        : { best: null, related: [] };
    } else {
      // A complete new question must not inherit a previous topic.
      match = matchFaqEntries(dto.question, candidates);
    }
    const { best, related, ambiguous } = match;
    const visitTransaction = isVisitRequestTransaction(dto.question);
    // Changes to a sent request go through a General Inquiry; the Visit
    // Request form would only create a duplicate request.
    const visitRedirect = isVisitRequestChange(dto.question)
      ? FaqAssistantRedirect.GENERAL_INQUIRY
      : FaqAssistantRedirect.VISIT_REQUEST;
    const relatedQuestions = related.map(({ entry }) =>
      this.toPublicQuestion(entry),
    );

    if (ambiguous) {
      return {
        outcome: FaqAssistantOutcome.CLARIFICATION_NEEDED,
        answer: null,
        related: relatedQuestions,
        message: FAQ_CLARIFICATION_MESSAGE,
        redirect: visitTransaction ? visitRedirect : null,
        notice: FAQ_ASSISTANT_NOTICE,
      };
    }

    if (best) {
      return {
        outcome: FaqAssistantOutcome.ANSWERED,
        answer: {
          ...this.toPublicQuestion(best.entry),
          answer: best.entry.answer,
        },
        related: relatedQuestions,
        message: visitTransaction ? FAQ_VISIT_REQUEST_MESSAGE : null,
        redirect: visitTransaction ? visitRedirect : null,
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
        : followup && !dto.selectedFaqId
          ? FAQ_CONTEXT_MESSAGE
          : FAQ_NO_MATCH_MESSAGE,
      redirect: visitTransaction
        ? visitRedirect
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
