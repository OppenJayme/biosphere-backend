import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CommunicationDirection,
  CommunicationTarget,
  CommunicationType,
  recordInboundReply,
  recordInternalEntry,
} from '../communication-history/communication-history';
import { Prisma } from '../generated/prisma/client';
import { referenceCode, referenceIdRange } from '../mail/visitor-email';
import { PrismaService } from '../prisma/prisma.service';
import { GmailApiError, GmailClient } from './gmail.client';
import { ParsedReply, parseGmailMessage } from './reply-parser';
import { MailboxSyncResult, MailboxSyncStatus } from './mailbox-sync.entity';

const DEFAULT_INTERVAL_SECONDS = 120;
const MIN_INTERVAL_SECONDS = 60;
const DEFAULT_LOOKBACK_DAYS = 14;
// Re-read a few minutes before the newest message already seen, so mail
// that Gmail indexes late is not missed. Duplicates are skipped by
// external_message_id.
const OVERLAP_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ERROR_LENGTH = 500;
// Prisma codes that mean this row's own values were rejected (too long,
// invalid characters, failed constraint), not that the database is down.
const DATA_ERROR_CODES = new Set(['P2000', 'P2004', 'P2007', 'P2010', 'P2011']);

// Error type and code only: messages from the database may quote reply text.
function describeError(error: unknown): string {
  if (error instanceof GmailApiError) return error.message;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `${error.name} ${error.code}`;
  }
  return error instanceof Error ? error.name : 'unknown error';
}

interface MatchedRecord {
  target: CommunicationTarget;
  recordId: string;
  recordType: 'inquiry' | 'visit_request';
  // Set when the reply quoted an inquiry that a curator has since turned
  // into this visit request.
  forwardedFromInquiryId?: string;
}

// Imports visitor replies from the museum mailbox into the matching
// inquiry or visit-request timeline (SRS change approved 2026-11-11). It
// only reads the mailbox, never sends, labels, or deletes mail. A reply is
// imported only when it can be tied to exactly one record AND comes from
// that record's email address; anything else stays in Gmail only.
@Injectable()
export class MailboxSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MailboxSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<MailboxSyncResult> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly gmail: GmailClient,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    // Tests load the same .env; a test run must never read the mailbox.
    if (!this.isEnabled() || this.config.get('NODE_ENV') === 'test') return;
    if (!this.gmail.isConfigured()) {
      this.logger.warn(
        'GMAIL_SYNC_ENABLED is true but Gmail credentials are missing; replies will not sync.',
      );
      return;
    }
    this.timer = setInterval(() => {
      void this.sync().catch(() => undefined);
    }, this.intervalSeconds() * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async getStatus(): Promise<MailboxSyncStatus> {
    const mailbox = this.mailbox();
    const state = mailbox
      ? await this.prisma.gmail_sync_state.findUnique({ where: { mailbox } })
      : null;
    return {
      enabled: this.isEnabled(),
      configured: this.gmail.isConfigured(),
      mailbox,
      intervalSeconds: this.intervalSeconds(),
      lastCheckedAt: state?.last_checked_at ?? null,
      lastSuccessAt: state?.last_success_at ?? null,
      lastMessageAt: state?.last_message_at ?? null,
      lastError: state?.last_error ?? null,
    };
  }

  // Runs one sync now. A run already in progress is shared, not repeated.
  sync(): Promise<MailboxSyncResult> {
    if (!this.isEnabled() || !this.gmail.isConfigured()) {
      return Promise.reject(
        new ServiceUnavailableException(
          'Mailbox sync is not set up on this server.',
        ),
      );
    }
    this.running ??= this.runSync().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async runSync(): Promise<MailboxSyncResult> {
    const mailbox = this.mailbox()!;
    const checkedAt = new Date();
    const state = await this.prisma.gmail_sync_state.findUnique({
      where: { mailbox },
    });
    const since = state?.last_message_at
      ? new Date(state.last_message_at.getTime() - OVERLAP_MS)
      : new Date(checkedAt.getTime() - this.lookbackDays() * DAY_MS);
    const result: MailboxSyncResult = {
      checked: 0,
      imported: 0,
      skipped: 0,
      failed: 0,
    };
    let newest = state?.last_message_at ?? null;

    try {
      const ids = await this.gmail.listMessageIds(
        // Not only the inbox: a reply archived or filtered before a check
        // still counts. Gmail search already leaves out spam and trash.
        `-in:sent -in:drafts -from:me after:${Math.floor(since.getTime() / 1000)}`,
      );
      // Oldest first, so the timeline order follows the mailbox.
      for (const id of ids.reverse()) {
        const reply = parseGmailMessage(await this.gmail.getMessage(id));
        result.checked += 1;
        result[await this.importReply(reply)] += 1;
        // Advance only once the message is handled, so a run that stops
        // early (Gmail or database outage) resumes at that message.
        if (!newest || reply.receivedAt > newest) newest = reply.receivedAt;
      }
      await this.saveState(mailbox, {
        last_checked_at: checkedAt,
        last_success_at: checkedAt,
        last_message_at: newest,
        last_error:
          result.failed > 0
            ? `${result.failed} matched repl(ies) could not be imported; see the server log.`
            : null,
      });
      if (result.imported > 0) {
        this.logger.log(`Imported ${result.imported} visitor repl(ies).`);
      }
      return result;
    } catch (error) {
      // Only Gmail errors are known to carry no message content; anything
      // else may quote reply text, so it never reaches the status or response.
      const reason =
        error instanceof GmailApiError
          ? error.message
          : 'Unexpected error while checking the mailbox; see the server log.';
      this.logger.warn(`Mailbox sync failed: ${describeError(error)}`);
      // Keep the progress made before the failure.
      await this.saveState(mailbox, {
        last_checked_at: checkedAt,
        last_message_at: newest,
        last_error: reason.slice(0, MAX_ERROR_LENGTH),
      }).catch(() => undefined);
      throw new ServiceUnavailableException(
        `The mailbox could not be checked: ${reason}`,
      );
    }
  }

  // What happened to one mailbox message. A database rejection tied to this
  // message's own data counts as failed and the run moves on, so one bad
  // email can never block every later reply; any other error stops the run.
  private async importReply(
    reply: ParsedReply,
  ): Promise<'imported' | 'skipped' | 'failed'> {
    if (reply.automated || !reply.authenticated || !reply.from || !reply.text) {
      return 'skipped';
    }
    const match = await this.matchRecord(reply);
    if (!match) return 'skipped';

    try {
      await this.prisma.$transaction(async (transaction) => {
        const entry = await recordInboundReply(transaction, {
          target: match.target,
          subject: reply.subject || '(no subject)',
          message: reply.text,
          receivedAt: reply.receivedAt,
          externalMessageId: reply.messageId,
        });
        if (match.forwardedFromInquiryId) {
          // The visitor answered the old inquiry thread; leave a pointer
          // there so the inquiry's history still explains where it went.
          await recordInternalEntry(transaction, {
            target: { inquiryId: match.forwardedFromInquiryId },
            recordedBy: null,
            type: CommunicationType.NOTE,
            message: `A visitor reply to this inquiry was filed on visit request ${referenceCode(match.recordId)}, which this inquiry was turned into.`,
          });
        }
        // No message text or address in the audit, matching outbound email.
        await transaction.audit_log.create({
          data: {
            user_id: null,
            affected_record_id: match.recordId,
            affected_record_type: match.recordType,
            action: 'IMPORT_VISITOR_REPLY',
            module: 'mailbox-sync',
            details: {
              entryId: entry.id,
              ...(match.forwardedFromInquiryId && {
                forwardedFromInquiryId: match.forwardedFromInquiryId,
              }),
            },
            status: 'SUCCESS',
          },
        });
      });
      return 'imported';
    } catch (error) {
      // Already imported by an earlier or concurrent run.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return 'skipped';
      }
      if (
        error instanceof Prisma.PrismaClientValidationError ||
        (error instanceof Prisma.PrismaClientKnownRequestError &&
          DATA_ERROR_CODES.has(error.code))
      ) {
        this.logger.warn(
          `Mailbox message ${reply.gmailId} could not be imported: ${describeError(error)}`,
        );
        return 'failed';
      }
      throw error;
    }
  }

  // 1. In-Reply-To / References naming an email BioSphere sent, else
  // 2. the "(Ref XXXXXXXX)" code in the subject.
  // Either way the sender must be the record's own email address, so a
  // forwarded or spoofed-looking thread never joins a visitor's record.
  private async matchRecord(reply: ParsedReply): Promise<MatchedRecord | null> {
    const sender = reply.from!;
    const sameSender = (email: string) => email.trim().toLowerCase() === sender;

    if (reply.inReplyTo.length > 0) {
      const sent = await this.prisma.communication_history.findFirst({
        where: {
          direction: CommunicationDirection.OUTBOUND,
          external_message_id: { in: reply.inReplyTo },
        },
        select: {
          inquiry: { select: { id: true, email_address: true } },
          visit_request: { select: { id: true, email_address: true } },
        },
      });
      if (sent?.inquiry && sameSender(sent.inquiry.email_address)) {
        return this.inquiryMatch(sent.inquiry.id, sameSender);
      }
      if (sent?.visit_request && sameSender(sent.visit_request.email_address)) {
        return this.visitMatch(sent.visit_request.id);
      }
    }

    if (!reply.reference) return null;
    const range = referenceIdRange(reply.reference);
    const byEmail = { equals: sender, mode: Prisma.QueryMode.insensitive };
    const [inquiries, visits] = await Promise.all([
      this.prisma.inquiry.findMany({
        where: { id: range, email_address: byEmail },
        select: { id: true },
        take: 2,
      }),
      this.prisma.visit_request.findMany({
        where: { id: range, email_address: byEmail },
        select: { id: true },
        take: 2,
      }),
    ]);
    // A reference shared by two of the visitor's records is ambiguous.
    if (inquiries.length + visits.length !== 1) return null;
    return inquiries[0]
      ? this.inquiryMatch(inquiries[0].id, sameSender)
      : this.visitMatch(visits[0].id);
  }

  // An inquiry a curator turned into a visit request is no longer worked
  // on, so its replies go to that visit request (team decision 2026-11-14).
  // The newest referral wins; one from a different address never does.
  private async inquiryMatch(
    id: string,
    sameSender: (email: string) => boolean,
  ): Promise<MatchedRecord> {
    const referred = await this.prisma.visit_request.findFirst({
      where: { source_inquiry_id: id },
      orderBy: { created_at: 'desc' },
      select: { id: true, email_address: true },
    });
    if (referred && sameSender(referred.email_address)) {
      return { ...this.visitMatch(referred.id), forwardedFromInquiryId: id };
    }
    return { target: { inquiryId: id }, recordId: id, recordType: 'inquiry' };
  }

  private visitMatch(id: string): MatchedRecord {
    return {
      target: { visitRequestId: id },
      recordId: id,
      recordType: 'visit_request',
    };
  }

  private async saveState(
    mailbox: string,
    data: Omit<Prisma.gmail_sync_stateUncheckedCreateInput, 'mailbox'>,
  ): Promise<void> {
    const values = { ...data, updated_at: new Date() };
    await this.prisma.gmail_sync_state.upsert({
      where: { mailbox },
      create: { mailbox, ...values },
      update: values,
    });
  }

  private isEnabled(): boolean {
    return this.config.get<string>('GMAIL_SYNC_ENABLED') === 'true';
  }

  private mailbox(): string | null {
    return (
      this.config.get<string>('GMAIL_MAILBOX')?.trim().toLowerCase() || null
    );
  }

  private intervalSeconds(): number {
    const value = Number(this.config.get('GMAIL_SYNC_INTERVAL_SECONDS'));
    return Number.isFinite(value) && value >= MIN_INTERVAL_SECONDS
      ? Math.floor(value)
      : DEFAULT_INTERVAL_SECONDS;
  }

  private lookbackDays(): number {
    const value = Number(this.config.get('GMAIL_SYNC_LOOKBACK_DAYS'));
    return Number.isFinite(value) && value > 0
      ? Math.min(Math.floor(value), 90)
      : DEFAULT_LOOKBACK_DAYS;
  }
}
