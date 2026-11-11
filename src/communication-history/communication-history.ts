import type { Prisma, communication_history } from '../generated/prisma/client';
import { CommunicationEntry } from './communication-history.entity';

// Stored in communication_history.direction / communication_type. INTERNAL
// entries are curator records; OUTBOUND entries are emails BioSphere sent on
// a curator's behalf; INBOUND entries are visitor replies imported from the
// museum mailbox (SRS change approved 2026-11-11, replacing the
// outbound-only rule in BR-22). INBOUND entries have no acting curator.
export const CommunicationDirection = {
  INTERNAL: 'INTERNAL',
  OUTBOUND: 'OUTBOUND',
  INBOUND: 'INBOUND',
} as const;

export const CommunicationType = {
  STATUS_CHANGE: 'STATUS_CHANGE',
  REFERRAL: 'REFERRAL',
  NOTE: 'NOTE',
  // Email telling the visitor about a curator decision (approve, decline,
  // cancel), REQ-4.9-11.
  STATUS_UPDATE_EMAIL: 'STATUS_UPDATE_EMAIL',
  // Curator-written email: an inquiry reply (REQ-4.8-09) or a visit-request
  // message such as a request for more information (REQ-4.9-10).
  MESSAGE_EMAIL: 'MESSAGE_EMAIL',
  // Visitor email reply matched to this record by the mailbox sync.
  VISITOR_REPLY: 'VISITOR_REPLY',
} as const;

export type CommunicationType =
  (typeof CommunicationType)[keyof typeof CommunicationType];

export type CommunicationTarget =
  { inquiryId: string } | { visitRequestId: string };

export async function recordInternalEntry(
  client: Prisma.TransactionClient,
  params: {
    target: CommunicationTarget;
    recordedBy: string;
    type: CommunicationType;
    message: string;
  },
): Promise<CommunicationEntry> {
  const created = await client.communication_history.create({
    data: {
      ...toTargetColumns(params.target),
      recorded_by: params.recordedBy,
      direction: CommunicationDirection.INTERNAL,
      communication_type: params.type,
      message: params.message,
    },
  });
  return toCommunicationEntry(created);
}

// Records an email BioSphere sent (or tried to send) for a curator, with
// the delivery result, so the timeline shows whether it went out
// (REQ-4.8-09, REQ-4.9-11/14).
export async function recordOutboundEmail(
  client: Prisma.TransactionClient,
  params: {
    target: CommunicationTarget;
    recordedBy: string;
    type: CommunicationType;
    recipientEmail: string;
    subject: string;
    message: string;
    deliveryResult: string;
    delivered: boolean;
    // Provider Message-ID, so a visitor's reply can be matched back to the
    // record by its In-Reply-To header.
    externalMessageId?: string | null;
  },
): Promise<CommunicationEntry> {
  const created = await client.communication_history.create({
    data: {
      ...toTargetColumns(params.target),
      recorded_by: params.recordedBy,
      direction: CommunicationDirection.OUTBOUND,
      external_message_id: params.externalMessageId ?? null,
      communication_type: params.type,
      recipient_email: params.recipientEmail,
      subject: params.subject.slice(0, 255),
      message: params.message,
      delivery_result: params.deliveryResult,
      sent_at: params.delivered ? new Date() : null,
    },
  });
  return toCommunicationEntry(created);
}

// Records a visitor reply imported from the museum mailbox. The unique
// external_message_id makes a second import of the same email fail with
// P2002 instead of duplicating the entry.
export async function recordInboundReply(
  client: Prisma.TransactionClient,
  params: {
    target: CommunicationTarget;
    subject: string;
    message: string;
    receivedAt: Date;
    externalMessageId: string;
  },
): Promise<CommunicationEntry> {
  const created = await client.communication_history.create({
    data: {
      ...toTargetColumns(params.target),
      recorded_by: null,
      direction: CommunicationDirection.INBOUND,
      communication_type: CommunicationType.VISITOR_REPLY,
      subject: params.subject.slice(0, 255),
      message: params.message,
      sent_at: params.receivedAt,
      external_message_id: params.externalMessageId,
    },
  });
  return toCommunicationEntry(created);
}

// Oldest first, so the timeline reads in the order things happened.
export async function listEntries(
  client: Prisma.TransactionClient,
  target: CommunicationTarget,
): Promise<CommunicationEntry[]> {
  const rows = await client.communication_history.findMany({
    where: toTargetColumns(target),
    orderBy: [{ created_at: 'asc' }, { id: 'asc' }],
  });
  return rows.map((row) => toCommunicationEntry(row));
}

// "Status changed from PENDING to REVIEWED." plus the curator's optional
// decision note, so the timeline explains why without a second entry.
export function describeStatusChange(
  from: string,
  to: string,
  note?: string,
): string {
  const summary = `Status changed from ${from} to ${to}.`;
  return note ? `${summary}\n\n${note}` : summary;
}

function toTargetColumns(target: CommunicationTarget): {
  inquiry_id?: string;
  visit_request_id?: string;
} {
  return 'inquiryId' in target
    ? { inquiry_id: target.inquiryId }
    : { visit_request_id: target.visitRequestId };
}

function toCommunicationEntry(row: communication_history): CommunicationEntry {
  return {
    id: row.id,
    direction: row.direction,
    type: row.communication_type,
    subject: row.subject,
    message: row.message,
    recipientEmail: row.recipient_email,
    deliveryResult: row.delivery_result,
    sentAt: row.sent_at,
    recordedBy: row.recorded_by,
    createdAt: row.created_at,
  };
}
