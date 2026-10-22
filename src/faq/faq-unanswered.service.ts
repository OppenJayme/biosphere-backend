import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ListUnansweredQuestionsQueryDto,
  UnansweredQuestionReviewFilter,
} from './dto/list-unanswered-questions-query.dto';
import { ReviewUnansweredQuestionDto } from './dto/review-unanswered-question.dto';
import {
  FaqUnansweredQuestion,
  FaqUnansweredQuestionPage,
} from './entities/faq-unanswered-question.entity';
import { normalizeFaqText } from './faq-matcher';

/** Proposed retention for unanswered-question logs (client proposal §7). */
export const UNANSWERED_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_QUESTION_LENGTH = 500;

interface GroupRow {
  id: string;
  question: string;
  outcome: string;
  times_asked: bigint | number;
  first_asked_at: Date;
  last_asked_at: Date;
  reviewed_at: Date | null;
  reviewed_by_name: string | null;
  faq_entry_id: string | null;
}

/**
 * Logs public questions the assistant could not answer so curators can add
 * or improve FAQ entries. Only the question text is stored: no visitor
 * identity, IP address, or session. Rows older than the retention window are
 * pruned on every write and hidden from reads.
 */
@Injectable()
export class FaqUnansweredService {
  private readonly logger = new Logger(FaqUnansweredService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws: a logging failure must not break the public answer. */
  async record(
    question: string,
    outcome: string,
    now = new Date(),
  ): Promise<void> {
    const text = question.trim().slice(0, MAX_QUESTION_LENGTH);
    const normalized =
      normalizeFaqText(text).slice(0, MAX_QUESTION_LENGTH) ||
      text.toLowerCase();
    try {
      await this.prisma.$transaction([
        this.prisma.faq_unanswered_question.create({
          data: {
            question: text,
            normalized_question: normalized,
            outcome,
            asked_at: now,
          },
        }),
        this.prisma.faq_unanswered_question.deleteMany({
          where: { asked_at: { lt: this.retentionCutoff(now) } },
        }),
      ]);
    } catch (error) {
      this.logger.warn(
        `Could not log an unanswered FAQ question: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async list(
    query: ListUnansweredQuestionsQueryDto,
    now = new Date(),
  ): Promise<FaqUnansweredQuestionPage> {
    const cutoff = this.retentionCutoff(now);
    const reviewFilter =
      query.review === UnansweredQuestionReviewFilter.OPEN
        ? Prisma.sql`HAVING bool_or(q.reviewed_at IS NULL)`
        : query.review === UnansweredQuestionReviewFilter.REVIEWED
          ? Prisma.sql`HAVING bool_and(q.reviewed_at IS NOT NULL)`
          : Prisma.empty;
    // One row per wording: counts, first/last ask, and the latest review.
    const groups = Prisma.sql`
      SELECT q.normalized_question,
        count(*) AS times_asked,
        min(q.asked_at) AS first_asked_at,
        max(q.asked_at) AS last_asked_at,
        CASE WHEN bool_or(q.reviewed_at IS NULL) THEN NULL
             ELSE max(q.reviewed_at) END AS reviewed_at,
        (array_agg(q.reviewed_by ORDER BY q.reviewed_at DESC NULLS LAST))[1]
          AS reviewed_by,
        (array_agg(q.faq_entry_id ORDER BY q.reviewed_at DESC NULLS LAST))[1]
          AS faq_entry_id,
        (array_agg(q.id ORDER BY q.asked_at DESC, q.id DESC))[1] AS latest_id
      FROM faq_unanswered_question q
      WHERE q.asked_at >= ${cutoff}
      GROUP BY q.normalized_question
      ${reviewFilter}`;

    const [countRows, rows] = await Promise.all([
      this.prisma.$queryRaw<{ total: bigint | number }[]>(
        Prisma.sql`SELECT count(*) AS total FROM (${groups}) g`,
      ),
      this.prisma.$queryRaw<GroupRow[]>(Prisma.sql`
        SELECT latest.id, latest.question, latest.outcome,
          g.times_asked, g.first_asked_at, g.last_asked_at, g.reviewed_at,
          reviewer.full_name AS reviewed_by_name, g.faq_entry_id
        FROM (${groups}) g
        JOIN faq_unanswered_question latest ON latest.id = g.latest_id
        LEFT JOIN user_account reviewer ON reviewer.id = g.reviewed_by
        ORDER BY g.last_asked_at DESC, latest.id
        LIMIT ${query.limit} OFFSET ${(query.page - 1) * query.limit}`),
    ]);

    return {
      items: rows.map((row) => this.toEntity(row)),
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      limit: query.limit,
      retentionDays: UNANSWERED_RETENTION_DAYS,
    };
  }

  /** Marks every open ask of the same wording as reviewed. */
  async review(
    id: string,
    dto: ReviewUnansweredQuestionDto,
    actingCuratorAccountId: string,
  ): Promise<{ id: string; reviewedCount: number }> {
    const row = await this.prisma.faq_unanswered_question.findUnique({
      where: { id },
      select: { normalized_question: true },
    });
    if (!row) {
      throw new NotFoundException(`Unanswered question ${id} not found`);
    }
    if (dto.faqEntryId) {
      const entry = await this.prisma.faq_entry.findUnique({
        where: { id: dto.faqEntryId },
        select: { id: true },
      });
      if (!entry) {
        throw new NotFoundException(`FAQ entry ${dto.faqEntryId} not found`);
      }
    }
    const result = await this.prisma.faq_unanswered_question.updateMany({
      where: {
        normalized_question: row.normalized_question,
        reviewed_at: null,
      },
      data: {
        reviewed_at: new Date(),
        reviewed_by: actingCuratorAccountId,
        faq_entry_id: dto.faqEntryId ?? null,
      },
    });
    return { id, reviewedCount: result.count };
  }

  private retentionCutoff(now: Date): Date {
    return new Date(now.getTime() - UNANSWERED_RETENTION_DAYS * DAY_MS);
  }

  private toEntity(row: GroupRow): FaqUnansweredQuestion {
    return {
      id: row.id,
      question: row.question,
      outcome: row.outcome,
      timesAsked: Number(row.times_asked),
      firstAskedAt: row.first_asked_at,
      lastAskedAt: row.last_asked_at,
      reviewedAt: row.reviewed_at,
      reviewedByName: row.reviewed_by_name,
      faqEntryId: row.faq_entry_id,
    };
  }
}
