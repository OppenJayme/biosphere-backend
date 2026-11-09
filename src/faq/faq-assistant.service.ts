import { Injectable } from '@nestjs/common';
import { faq_status } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FaqAiComposerService } from './ai/faq-ai-composer.service';
import { AskFaqAssistantDto } from './dto/ask-faq-assistant.dto';
import { ListFaqSuggestionsQueryDto } from './dto/list-faq-suggestions-query.dto';
import {
  FAQ_AI_NOTICE,
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
  FAQ_MATCHING_RULES,
  hasApprovedScope,
  isVisitRequestChange,
  isVisitRequestTransaction,
  matchFaqEntries,
  parseFaqFollowup,
  retrieveFaqCandidates,
  tokenizeFaqText,
  type FaqMatchResult,
} from './faq-matcher';
import {
  FAQ_SMALL_TALK_REPLIES,
  detectFaqSmallTalk,
  stripLeadingGreeting,
} from './faq-small-talk';

const PUBLIC_QUESTION_SELECT = {
  id: true,
  question: true,
  category: true,
} as const;

/**
 * Approved excerpts sent to the optional AI layer per visitor message. A small
 * knowledge base is sent whole (most relevant first) so the model can connect
 * paraphrases like "pay to get in" to admission; a larger one sends the top
 * five. Every entry is public, ACTIVE, curator-approved FAQ text.
 */
const AI_SOURCE_LIMIT = 5;
const AI_WHOLE_KNOWLEDGE_LIMIT = 25;
/** Short questions borrow the previous visitor question for retrieval only. */
const SHORT_QUESTION_TOKENS = 4;

/**
 * Public, read-only FAQ Assistant. It reads only ACTIVE entries and never
 * writes (no question, IP or audit row is stored).
 *
 * Order of decisions:
 * 1. Greetings, thanks, goodbyes and help requests get fixed replies.
 * 2. The deterministic matcher answers with stored curator text when it finds
 *    a direct match; a direct match never goes to the AI layer.
 * 3. Otherwise, when the optional AI layer is enabled, up to five relevant
 *    approved entries are reworded into an answer that must cite them and pass
 *    the server-side evidence check.
 * 4. Anything else falls back to General Inquiry (BR-18), with up to three
 *    approved questions the visitor might have meant.
 */
@Injectable()
export class FaqAssistantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: FaqAiComposerService,
  ) {}

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
      notice: this.notice(),
    };
  }

  async ask(
    dto: AskFaqAssistantDto,
    clientKey = 'anonymous',
  ): Promise<FaqAssistantResponse> {
    const notice = this.notice();
    const smallTalk = dto.selectedFaqId
      ? null
      : detectFaqSmallTalk(dto.question);
    if (smallTalk) {
      return {
        outcome: FaqAssistantOutcome.SMALL_TALK,
        answer: null,
        related: [],
        message: FAQ_SMALL_TALK_REPLIES[smallTalk],
        redirect: null,
        assisted: false,
        sources: [],
        notice,
      };
    }

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
    // "Hello, where is the museum?" is matched as "where is the museum".
    const question = dto.selectedFaqId
      ? dto.question
      : stripLeadingGreeting(dto.question);

    // IDs are public references, not authorization: always recheck ACTIVE status.
    // A stale/unknown choice must not silently answer from a different entry.
    const selected = dto.selectedFaqId
      ? candidates.find((entry) => entry.id === dto.selectedFaqId)
      : undefined;
    const followup = parseFaqFollowup(question);
    const context = dto.contextFaqId
      ? candidates.find((entry) => entry.id === dto.contextFaqId)
      : undefined;
    let match: FaqMatchResult<(typeof candidates)[number]>;
    if (dto.selectedFaqId) {
      match = {
        best: selected ? { entry: selected, score: 1 } : null,
        related: [],
      };
    } else if (followup !== null) {
      const qualifiers = tokenizeFaqText(followup);
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
            `${context.question} ${followup}`,
            contextualCandidates,
          )
        : { best: null, related: [] };
    } else {
      // A complete new question must not inherit a previous topic.
      match = matchFaqEntries(question, candidates);
    }
    const { best, related, ambiguous } = match;
    const visitTransaction = isVisitRequestTransaction(question);
    // Changes to a sent request go through a General Inquiry; the Visit
    // Request form would only create a duplicate request.
    const visitRedirect = isVisitRequestChange(question)
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
        assisted: false,
        sources: [],
        notice,
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
        assisted: false,
        sources: [],
        notice,
      };
    }

    if (dto.selectedFaqId) {
      // A stale explicit choice never falls through to AI or suggestions.
      return visitTransaction
        ? this.visitRedirect(relatedQuestions, visitRedirect, notice)
        : this.noMatch(relatedQuestions, notice, FAQ_NO_MATCH_MESSAGE);
    }

    // No direct answer. Retrieval may borrow the previous question so that a
    // short follow-up ("Saturday?") can find its topic; it never answers alone.
    const history = dto.history ?? [];
    const retrievalQuery = [
      question,
      ...(followup !== null ||
      tokenizeFaqText(question).length <= SHORT_QUESTION_TOKENS
        ? [context?.question ?? '', history[history.length - 1] ?? '']
        : []),
    ].join(' ');
    const hits = retrieveFaqCandidates(
      retrievalQuery,
      candidates,
      AI_SOURCE_LIMIT,
      question,
    );

    const aiEntries =
      candidates.length <= AI_WHOLE_KNOWLEDGE_LIMIT
        ? [
            ...hits.map(({ entry }) => entry),
            ...candidates.filter(
              (entry) =>
                !hits.some((hit) => hit.entry.id === entry.id) &&
                hasApprovedScope(question, entry),
            ),
          ]
        : hits.map(({ entry }) => entry);

    const ai = await this.ai.compose({
      question,
      history,
      previousTopic: context?.question,
      sources: aiEntries.map((entry) => ({
        id: entry.id,
        question: entry.question,
        answer: entry.answer,
      })),
      clientKey,
    });
    if (ai.kind === 'answer') {
      const cited = ai.sourceIds.map((id) =>
        aiEntries.find((entry) => entry.id === id)!,
      );
      return {
        outcome: FaqAssistantOutcome.ANSWERED,
        answer: { ...this.toPublicQuestion(cited[0]), answer: ai.text },
        related: [],
        message: visitTransaction ? FAQ_VISIT_REQUEST_MESSAGE : null,
        redirect: visitTransaction ? visitRedirect : null,
        assisted: true,
        sources: cited.map((entry) => this.toPublicQuestion(entry)),
        notice,
      };
    }
    if (ai.kind === 'clarify' && hits.length >= 2) {
      return {
        outcome: FaqAssistantOutcome.CLARIFICATION_NEEDED,
        answer: null,
        related: hits
          .slice(0, FAQ_MATCHING_RULES.MAX_RELATED)
          .map(({ entry }) => this.toPublicQuestion(entry)),
        message: ai.text,
        redirect: visitTransaction ? visitRedirect : null,
        assisted: true,
        sources: [],
        notice,
      };
    }

    if (visitTransaction) {
      return this.visitRedirect(relatedQuestions, visitRedirect, notice);
    }
    // Suggest approved questions the visitor may have meant ("Museum where"
    // offers "Where is the museum located?"). Choosing one asks it explicitly.
    const suggestions =
      relatedQuestions.length || followup !== null
        ? relatedQuestions
        : hits
            .slice(0, FAQ_MATCHING_RULES.MAX_RELATED)
            .map(({ entry }) => this.toPublicQuestion(entry));
    return this.noMatch(
      suggestions,
      notice,
      followup !== null ? FAQ_CONTEXT_MESSAGE : FAQ_NO_MATCH_MESSAGE,
    );
  }

  private visitRedirect(
    related: PublicFaqQuestion[],
    redirect: FaqAssistantRedirect,
    notice: string,
  ): FaqAssistantResponse {
    return {
      outcome: FaqAssistantOutcome.VISIT_REQUEST_REDIRECT,
      answer: null,
      related,
      message: FAQ_VISIT_REQUEST_MESSAGE,
      redirect,
      assisted: false,
      sources: [],
      notice,
    };
  }

  private noMatch(
    related: PublicFaqQuestion[],
    notice: string,
    message: string,
  ): FaqAssistantResponse {
    return {
      outcome: FaqAssistantOutcome.NO_MATCH,
      answer: null,
      related,
      message,
      redirect: FaqAssistantRedirect.GENERAL_INQUIRY,
      assisted: false,
      sources: [],
      notice,
    };
  }

  private notice(): string {
    return this.ai.isEnabled()
      ? `${FAQ_ASSISTANT_NOTICE} ${FAQ_AI_NOTICE}`
      : FAQ_ASSISTANT_NOTICE;
  }

  private toPublicQuestion(entry: {
    id: string;
    question: string;
    category: string | null;
  }): PublicFaqQuestion {
    return { id: entry.id, question: entry.question, category: entry.category };
  }
}
