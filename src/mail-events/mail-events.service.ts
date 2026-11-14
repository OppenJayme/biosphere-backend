import { Injectable, Logger } from '@nestjs/common';
import { CommunicationDirection } from '../communication-history/communication-history';
import { PrismaService } from '../prisma/prisma.service';
import {
  BrevoDeliveryEvent,
  messageIdForms,
  nextDeliveryResult,
} from './brevo-event';

export interface MailEventsResult {
  received: number;
  updated: number;
}

// Applies Brevo delivery events to the visitor emails recorded on inquiry and
// visit-request timelines (communication_history.external_message_id holds
// the Brevo message id). Emails with no timeline entry, such as curator
// alerts and password emails, are ignored. Nothing else is changed, and no
// email address or message text is logged.
@Injectable()
export class MailEventsService {
  private readonly logger = new Logger(MailEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async apply(events: BrevoDeliveryEvent[]): Promise<MailEventsResult> {
    let updated = 0;
    for (const event of events) {
      const entry = await this.prisma.communication_history.findFirst({
        where: {
          direction: CommunicationDirection.OUTBOUND,
          external_message_id: { in: messageIdForms(event.messageId) },
        },
        select: { id: true, delivery_result: true },
      });
      if (!entry) continue;

      const next = nextDeliveryResult(entry.delivery_result, event);
      if (next === null) continue;

      // Only from the value just read, so two events racing for the same
      // email cannot overwrite each other's newer outcome.
      const { count } = await this.prisma.communication_history.updateMany({
        where: { id: entry.id, delivery_result: entry.delivery_result },
        data: { delivery_result: next },
      });
      updated += count;
      if (count > 0 && event.outcome === 'failed') {
        this.logger.warn(
          `Visitor email ${entry.id} was not delivered (${event.event}).`,
        );
      }
    }
    return { received: events.length, updated };
  }
}
