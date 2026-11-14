// Brevo transactional webhook events (Brevo "Transactional > Settings >
// Webhooks"). Brevo answers our send API with "accepted" even when the email
// is only queued (a used-up daily quota held 107 emails on 2026-11-14 while
// every timeline said "Sent"), so the real outcome arrives here later.

export type DeliveryOutcome = 'delivered' | 'delayed' | 'failed';

// Each event name maps to the outcome it proves. Opens and clicks can only
// happen after delivery. A spam complaint also means it was delivered.
// "request" (accepted) and "unsubscribed" add nothing to the timeline.
const OUTCOMES: Record<string, DeliveryOutcome> = {
  delivered: 'delivered',
  opened: 'delivered',
  unique_opened: 'delivered',
  proxy_open: 'delivered',
  unique_proxy_open: 'delivered',
  click: 'delivered',
  spam: 'delivered',
  deferred: 'delayed',
  soft_bounce: 'delayed',
  hard_bounce: 'failed',
  blocked: 'failed',
  invalid_email: 'failed',
  error: 'failed',
};

export interface BrevoDeliveryEvent {
  messageId: string;
  event: string;
  outcome: DeliveryOutcome;
  reason: string | null;
}

const MAX_RESULT_LENGTH = 100; // communication_history.delivery_result
const MAX_MESSAGE_ID_LENGTH = 255; // communication_history.external_message_id

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// The stored forms a webhook message id may match. MailService stores the
// send API's messageId as returned ("<…@smtp-relay.mailin.fr>" in Brevo's
// examples); matching with and without the angle brackets keeps tracking
// working if either side ever drops or adds them.
export function messageIdForms(messageId: string): string[] {
  const bare = messageId.trim().replace(/^<(.*)>$/, '$1');
  return [`<${bare}>`, bare];
}

// Brevo posts one event object, or an array when batching is switched on.
// Keep batching off in Brevo: Express's default 100 KB JSON limit applies to
// this route, and a larger batch would be refused (413) and retried.
// Anything without a known event and a message id is ignored, so an
// unexpected payload never fails the webhook (Brevo retries non-2xx).
export function parseBrevoEvents(body: unknown): BrevoDeliveryEvent[] {
  const items = Array.isArray(body) ? body : [body];
  return items.flatMap((item): BrevoDeliveryEvent[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const event = text(record.event)?.toLowerCase();
    const messageId = text(record['message-id'] ?? record.messageId);
    if (!event || !messageId || messageId.length > MAX_MESSAGE_ID_LENGTH) {
      return [];
    }
    const outcome = OUTCOMES[event];
    if (!outcome) return [];
    return [{ messageId, event, outcome, reason: text(record.reason) }];
  });
}

// How settled a stored delivery_result is. "SENT <id>" (accepted) is 0, a
// delay 1, and a final outcome 2, so a late "deferred" never undoes
// "delivered" and webhooks arriving out of order cannot move backwards.
function rank(result: string | null): number {
  if (!result) return 0;
  if (result.startsWith('FAILED') || result.includes(' · delivered')) return 2;
  if (result.includes(' · delayed')) return 1;
  return 0;
}

const OUTCOME_RANK: Record<DeliveryOutcome, number> = {
  delivered: 2,
  failed: 2,
  delayed: 1,
};

// The next delivery_result for a stored one, or null to leave it alone.
// Delivered and delayed keep the "SENT <id>" prefix, so a frontend that only
// knows SENT / FAILED / NOT_SENT still shows them as sent; a bounce after
// acceptance becomes FAILED, which every frontend version shows as failed.
export function nextDeliveryResult(
  current: string | null,
  event: BrevoDeliveryEvent,
): string | null {
  const currentRank = rank(current);
  const nextRank = OUTCOME_RANK[event.outcome];
  // A newer delay may update its reason; anything else must move forward.
  if (nextRank < currentRank || (nextRank === currentRank && nextRank !== 1)) {
    return null;
  }
  const reason = event.reason ? `: ${event.reason}` : '';
  const accepted = current?.startsWith('SENT')
    ? current.split(' · ')[0]
    : `SENT ${event.messageId}`;
  // Keep room for the outcome, which the rank above reads back.
  const sent = accepted.length > 70 ? 'SENT' : accepted;
  const value =
    event.outcome === 'failed'
      ? `FAILED ${event.event}${reason}`
      : event.outcome === 'delayed'
        ? `${sent} · delayed (${event.event})${reason}`
        : `${sent} · delivered`;
  return value.slice(0, MAX_RESULT_LENGTH);
}
