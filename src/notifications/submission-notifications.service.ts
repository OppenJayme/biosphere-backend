import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { buildVisitorEmail, referenceCode } from '../mail/visitor-email';
import { PrismaService } from '../prisma/prisma.service';
import { buildCuratorAlertEmail } from './curator-alert-email';
import { NotificationRecordType } from './entities/curator-notification.entity';

// Audit actions for the two submission emails. NotificationsService reads
// their FAILED entries back to surface undelivered emails in-system.
export const RECEIPT_AUDIT_ACTION = 'EMAIL_SUBMISSION_RECEIPT';
export const ALERT_AUDIT_ACTION = 'ALERT_CURATORS';

// A public submission that has just been saved.
export interface NewSubmission {
  recordType: NotificationRecordType;
  id: string;
  submittedAt: Date;
  visitorName: string;
  visitorEmail: string;
  // Label/value rows added to the visitor's receipt, e.g. preferred dates.
  receiptDetails?: Array<[string, string]>;
}

const RECORD_LABELS: Record<NotificationRecordType, string> = {
  [NotificationRecordType.INQUIRY]: 'general inquiry',
  [NotificationRecordType.VISIT_REQUEST]: 'visit request',
};

const AUDIT_MODULES: Record<NotificationRecordType, string> = {
  [NotificationRecordType.INQUIRY]: 'inquiries',
  [NotificationRecordType.VISIT_REQUEST]: 'visit-requests',
};

// Curator workspace route that opens the record (frontend Public Website
// page, which reads ?tab= and ?selected=).
const CURATOR_RECORD_TABS: Record<NotificationRecordType, string> = {
  [NotificationRecordType.INQUIRY]: 'inquiries',
  [NotificationRecordType.VISIT_REQUEST]: 'visits',
};

// Emails sent when a visitor submits a General Inquiry or Visit Request:
// a receipt to the visitor, and an alert to the authorized curator
// recipients (REQ-4.8-08, REQ-4.9-07, REQ-4.3-09). Each result is audited without
// visitor personal data. The in-system alert is the derived feed in
// NotificationsService.
@Injectable()
export class SubmissionNotificationsService {
  private readonly logger = new Logger(SubmissionNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // Called after the submission is saved and never throws, so a mail or
  // audit failure cannot undo or fail the visitor's submission.
  async announce(submission: NewSubmission): Promise<void> {
    const results = await Promise.allSettled([
      this.sendReceipt(submission),
      this.alertCurators(submission),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        const reason: unknown = result.reason;
        this.logger.warn(
          `Submission notification failed for ${submission.recordType} ${submission.id}: ${
            reason instanceof Error ? reason.message : String(reason)
          }`,
        );
      }
    }
  }

  private async sendReceipt(submission: NewSubmission): Promise<void> {
    const reference = referenceCode(submission.id);
    const isInquiry = submission.recordType === NotificationRecordType.INQUIRY;
    const email = buildVisitorEmail({
      to: submission.visitorEmail,
      visitorName: submission.visitorName,
      subject: isInquiry
        ? `We received your BioSphere museum inquiry (Ref ${reference})`
        : `We received your BioSphere visit request (Ref ${reference})`,
      paragraphs: isInquiry
        ? [
            'Thank you for contacting the museum. We have received your inquiry, and a curator will reply to this email address.',
          ]
        : [
            'Thank you for your interest in visiting the museum. We have received your visit request, and a curator will review your preferred schedules.',
            'This is not yet an approval. The museum will email you once a curator has reviewed your request.',
          ],
      details: submission.receiptDetails,
      reference,
    });
    const delivery = await this.mail.send(email);
    await this.recordAudit(
      submission,
      RECEIPT_AUDIT_ACTION,
      { delivered: delivery.delivered },
      delivery.delivered,
    );
  }

  private async alertCurators(submission: NewSubmission): Promise<void> {
    const recipients = await this.alertRecipients();
    if (recipients.size === 0) {
      this.logger.warn('No curator alert recipient is configured or active.');
    }

    const reference = referenceCode(submission.id);
    const link = this.recordLink(submission);
    const deliveries = await Promise.all(
      [...recipients].map(([to, curatorName]) =>
        this.mail.send(
          buildCuratorAlertEmail({
            to,
            curatorName,
            recordLabel: RECORD_LABELS[submission.recordType],
            reference,
            submittedAt: submission.submittedAt,
            link,
          }),
        ),
      ),
    );
    const delivered = deliveries.filter((delivery) => delivery.delivered);
    await this.recordAudit(
      submission,
      ALERT_AUDIT_ACTION,
      { recipients: recipients.size, delivered: delivered.length },
      recipients.size > 0 && delivered.length === recipients.size,
    );
  }

  // SRS 6.6 leaves the authorized curator recipients to deployment
  // configuration: CURATOR_ALERT_EMAILS (comma-separated) when set, otherwise
  // every active curator's login email. Returns address -> greeting name.
  private async alertRecipients(): Promise<Map<string, string>> {
    const curators = await this.prisma.user_account.findMany({
      where: { role: 'CURATOR', status: 'ACTIVE' },
      select: { full_name: true, users: { select: { email: true } } },
    });
    const activeCurators = new Map<string, string>();
    for (const curator of curators) {
      const address = curator.users.email?.trim().toLowerCase();
      if (address && !activeCurators.has(address)) {
        activeCurators.set(address, curator.full_name);
      }
    }

    const configured = (this.config.get<string>('CURATOR_ALERT_EMAILS') ?? '')
      .split(',')
      .map((address) => address.trim().toLowerCase())
      .filter((address) => address.includes('@'));
    if (configured.length === 0) return activeCurators;
    return new Map(
      configured.map((address) => [
        address,
        activeCurators.get(address) ?? 'Curator',
      ]),
    );
  }

  private recordLink(submission: NewSubmission): string | undefined {
    const base = this.config
      .get<string>('FRONTEND_URL')
      ?.trim()
      .replace(/\/+$/, '');
    if (!base) return undefined;
    const params = new URLSearchParams({
      tab: CURATOR_RECORD_TABS[submission.recordType],
      selected: submission.id,
    });
    return `${base}/public-website?${params.toString()}`;
  }

  // Recorded as FAILED when an email was not delivered (or no curator could
  // be alerted), so a missed alert shows up in the audit log.
  private async recordAudit(
    submission: NewSubmission,
    action: string,
    details: Prisma.InputJsonObject,
    succeeded: boolean,
  ): Promise<void> {
    await this.prisma.audit_log.create({
      data: {
        user_id: null,
        affected_record_id: submission.id,
        affected_record_type: submission.recordType,
        action,
        module: AUDIT_MODULES[submission.recordType],
        details,
        status: succeeded ? 'SUCCESS' : 'FAILED',
      },
    });
  }
}
