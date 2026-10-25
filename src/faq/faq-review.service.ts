import {
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SubmitFaqReviewDto } from './dto/submit-faq-review.dto';

@Injectable()
export class FaqReviewService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  policy() {
    return {
      enabled: this.config.get<string>('FAQ_REVIEW_ENABLED') === 'true',
      retentionDays: 30,
    };
  }

  private assertEnabled() {
    if (!this.policy().enabled)
      throw new ServiceUnavailableException(
        'Question review is not accepting submissions.',
      );
  }

  async submit(dto: SubmitFaqReviewDto) {
    this.assertEnabled();
    const normalized = dto.question
      .normalize('NFKC')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
    const hash = createHash('sha256').update(normalized).digest('hex');
    return this.transaction(async (tx) => {
      const now = new Date();
      const receipt = await tx.faq_review_receipt.findUnique({
        where: { id: dto.submissionId },
        include: { queue: true },
      });
      if (receipt && receipt.queue.expires_at > now) {
        if (receipt.question_hash !== hash)
          throw new ConflictException(
            'Use the same question when retrying a submission.',
          );
        return { accepted: true as const };
      }
      if (receipt)
        await tx.faq_review_item.deleteMany({
          where: { id: receipt.queue_id, expires_at: { lte: now } },
        });
      const previous = await tx.faq_review_item.findUnique({
        where: { question_hash: hash },
      });
      if (previous && previous.expires_at <= now)
        await tx.faq_review_item.deleteMany({
          where: { id: previous.id, expires_at: { lte: now } },
        });
      const item = await tx.faq_review_item.upsert({
        where: { question_hash: hash },
        create: {
          question_hash: hash,
          question: dto.question,
          repeat_count: 1,
          status: 'PENDING',
          first_submitted_at: now,
          last_submitted_at: now,
          expires_at: new Date(now.getTime() + 30 * 86400000),
        },
        // New explicit feedback reopens review, never extends the first retention deadline.
        update: {
          repeat_count: { increment: 1 },
          last_submitted_at: now,
          status: 'PENDING',
        },
      });
      await tx.faq_review_receipt.create({
        data: { id: dto.submissionId, queue_id: item.id, question_hash: hash },
      });
      return { accepted: true as const };
    });
  }

  async list(page: number, actorId: string) {
    this.assertEnabled();
    return this.transaction(async (tx) => {
      const rows = await tx.faq_review_item.findMany({
        where: { expires_at: { gt: new Date() } },
        orderBy: [{ last_submitted_at: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * 25,
        take: 26,
      });
      await tx.audit_log.create({
        data: {
          user_id: actorId,
          module: 'faq',
          action: 'READ_FAQ_REVIEW_QUEUE',
          affected_record_type: 'faq_review_item',
          status: 'SUCCESS',
          details: { page, returnedCount: Math.min(rows.length, 25) },
        },
      });
      return {
        items: rows.slice(0, 25).map((row) => ({
          id: row.id,
          question: row.question,
          repeatCount: row.repeat_count,
          status: row.status,
          firstSubmittedAt: row.first_submitted_at,
          lastSubmittedAt: row.last_submitted_at,
          expiresAt: row.expires_at,
        })),
        page,
        hasMore: rows.length > 25,
      };
    });
  }

  async review(id: string, status: 'REVIEWED' | 'DISMISSED', actorId: string) {
    this.assertEnabled();
    return this.transaction(async (tx) => {
      const result = await tx.faq_review_item.updateMany({
        where: { id, expires_at: { gt: new Date() } },
        data: { status },
      });
      if (!result.count)
        throw new NotFoundException('Review item is unavailable or expired.');
      await tx.audit_log.create({
        data: {
          user_id: actorId,
          module: 'faq',
          action: 'REVIEW_FAQ_QUESTION',
          affected_record_type: 'faq_review_item',
          affected_record_id: id,
          status: 'SUCCESS',
          details: { reviewStatus: status },
        },
      });
      return { updated: true };
    });
  }

  async remove(id: string, actorId: string) {
    this.assertEnabled();
    return this.transaction(async (tx) => {
      const result = await tx.faq_review_item.deleteMany({ where: { id } });
      if (!result.count)
        throw new NotFoundException('Review item is unavailable.');
      await tx.audit_log.create({
        data: {
          user_id: actorId,
          module: 'faq',
          action: 'REMOVE_FAQ_REVIEW_ITEM',
          affected_record_type: 'faq_review_item',
          affected_record_id: id,
          status: 'SUCCESS',
          details: { removed: true },
        },
      });
      return { removed: true };
    });
  }

  private async transaction<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (error instanceof HttpException) throw error;
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2002', 'P2034'].includes(error.code) &&
          attempt < 2
        )
          continue;
        // Do not leak driver errors, hashes or submitted text into logs/responses.
        throw new ServiceUnavailableException(
          'Question review is temporarily unavailable. Retry the same submission later.',
        );
      }
    }
    throw new ServiceUnavailableException(
      'Question review is temporarily unavailable.',
    );
  }
}
