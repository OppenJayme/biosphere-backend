import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
// communication_history.delivery_result is VARCHAR(100).
const MAX_RESULT_LENGTH = 100;

export interface OutgoingEmail {
  to: string;
  toName?: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailDeliveryResult {
  delivered: boolean;
  // Stored as communication_history.delivery_result, e.g. "SENT <id>".
  result: string;
}

// Sends transactional email through the Brevo API (SRS BR-22: outbound
// only; BioSphere never reads a mailbox). Never throws: a failed send is
// reported in the result so the caller's workflow change still stands.
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async send(email: OutgoingEmail): Promise<EmailDeliveryResult> {
    const apiKey = this.config.get<string>('BREVO_API_KEY');
    const fromEmail = this.config.get<string>('MAIL_FROM_EMAIL');
    const fromName =
      this.config.get<string>('MAIL_FROM_NAME') ?? 'BioSphere Museum';

    // Tests load the same .env; never let a test run send real email.
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return { delivered: false, result: 'NOT_SENT test environment' };
    }
    if (!apiKey || !fromEmail) {
      this.logger.warn(
        'BREVO_API_KEY or MAIL_FROM_EMAIL is not set; email not sent.',
      );
      return { delivered: false, result: 'NOT_SENT email not configured' };
    }

    try {
      const response = await fetch(BREVO_SEND_URL, {
        method: 'POST',
        headers: {
          'api-key': apiKey,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { email: fromEmail, name: fromName },
          to: [{ email: email.to, name: email.toName }],
          subject: email.subject,
          textContent: email.text,
          htmlContent: email.html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = (await response.json().catch(() => ({}))) as {
        messageId?: string;
        message?: string;
      };
      if (!response.ok) {
        this.logger.warn(
          `Brevo rejected an email (${response.status}): ${body.message ?? ''}`,
        );
        return {
          delivered: false,
          result: this.truncate(
            `FAILED ${response.status} ${body.message ?? ''}`.trim(),
          ),
        };
      }
      return {
        delivered: true,
        result: this.truncate(`SENT ${body.messageId ?? ''}`.trim()),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Email send failed: ${reason}`);
      return { delivered: false, result: this.truncate(`FAILED ${reason}`) };
    }
  }

  private truncate(value: string): string {
    return value.length > MAX_RESULT_LENGTH
      ? value.slice(0, MAX_RESULT_LENGTH)
      : value;
  }
}
