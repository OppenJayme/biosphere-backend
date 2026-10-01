import type { OutgoingEmail } from '../mail/mail.service';
import { escapeHtml } from '../mail/visitor-email';

export interface CuratorAlertContent {
  to: string;
  curatorName: string;
  // e.g. "general inquiry" or "visit request"
  recordLabel: string;
  reference: string;
  submittedAt: Date;
  // Curator workspace link to the record; omitted when FRONTEND_URL is unset.
  link?: string;
}

// "October 1, 2026 at 2:05 PM" in museum time.
export function formatMuseumDateTime(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Manila',
  }).format(value);
}

// Operational alert to a curator about a new public submission (REQ-4.3-09).
// Email leaves BioSphere, so it names only the reference number and time,
// never the visitor's details; the curator signs in to read the record.
export function buildCuratorAlertEmail(
  content: CuratorAlertContent,
): OutgoingEmail {
  const subject = `New ${content.recordLabel} received (Ref ${content.reference})`;
  const intro = `A new ${content.recordLabel} was submitted on the public website on ${formatMuseumDateTime(content.submittedAt)}.`;
  const action = content.link
    ? 'Sign in to BioSphere to review it:'
    : 'Sign in to BioSphere to review it.';

  const text = [
    `Hello ${content.curatorName},`,
    intro,
    `Reference number: ${content.reference}`,
    content.link ? `${action}\n${content.link}` : action,
    'BioSphere Museum',
  ].join('\n\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f6f3;font-family:Arial,Helvetica,sans-serif;color:#1f2a24">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 16px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#2f6b4f;font-weight:bold">BioSphere Museum</p>
<p style="margin:0 0 16px">Hello ${escapeHtml(content.curatorName)},</p>
<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(intro)}</p>
<p style="margin:0 0 16px;font-size:14px">Reference number: <strong style="font-family:monospace">${escapeHtml(content.reference)}</strong></p>
${
  content.link
    ? `<p style="margin:0"><a href="${escapeHtml(content.link)}" style="display:inline-block;padding:10px 18px;background:#2f6b4f;color:#ffffff;text-decoration:none;border-radius:6px">Review in BioSphere</a></p>`
    : `<p style="margin:0">${escapeHtml(action)}</p>`
}
</div></body></html>`;

  return { to: content.to, toName: content.curatorName, subject, text, html };
}
