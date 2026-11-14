// Which imported visitor replies still need a curator (VISITOR_REPLY alerts).

// Most replies an alert lookup reads, newest first. The museum gets a few
// replies a week; the cap keeps a burst from making the bell feed slow.
export const MAX_VISITOR_REPLY_ALERTS = 100;

export interface TimelineRow {
  inquiry_id: string | null;
  visit_request_id: string | null;
  created_at: Date;
}

export interface ReplyRow extends TimelineRow {
  id: string;
}

// A reply is answered once a curator records anything later on the same
// inquiry or visit request: an email, an internal note, or a status change.
// Entries BioSphere writes by itself (receipts, the pointer note left when a
// reply is moved to a referred visit request) have no curator, so callers
// pass only curator-recorded rows as follow-ups and those never clear it.
export function unansweredReplies<T extends ReplyRow>(
  replies: readonly T[],
  curatorFollowUps: readonly TimelineRow[],
): T[] {
  const latest = new Map<string, number>();
  for (const entry of curatorFollowUps) {
    const key = recordKey(entry);
    if (!key) continue;
    latest.set(key, Math.max(latest.get(key) ?? 0, entry.created_at.getTime()));
  }
  return replies.filter((reply) => {
    const key = recordKey(reply);
    if (!key) return false;
    return (latest.get(key) ?? 0) <= reply.created_at.getTime();
  });
}

function recordKey(row: TimelineRow): string | null {
  if (row.visit_request_id) return `visit:${row.visit_request_id}`;
  if (row.inquiry_id) return `inquiry:${row.inquiry_id}`;
  return null;
}
