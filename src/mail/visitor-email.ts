import type { OutgoingEmail } from './mail.service';

// Short code shown to visitors and searchable by curators: the first eight
// characters of the record's UUID, upper-cased (e.g. 9A81836F).
export function referenceCode(id: string): string {
  return id.slice(0, 8).toUpperCase();
}

// Matches a reference code typed into curator search.
export const REFERENCE_CODE_PATTERN = /^[0-9a-f]{8}$/i;

// UUID range covering every id that starts with the given reference code,
// so a Postgres uuid column can be searched without casting to text.
export function referenceIdRange(code: string): { gte: string; lte: string } {
  const prefix = code.toLowerCase();
  return {
    gte: `${prefix}-0000-0000-0000-000000000000`,
    lte: `${prefix}-ffff-ffff-ffff-ffffffffffff`,
  };
}

export interface VisitorEmailContent {
  to: string;
  visitorName: string;
  subject: string;
  // Paragraphs of plain text; the first is the main message.
  paragraphs: string[];
  // Label/value rows shown as a small summary table.
  details?: Array<[string, string]>;
  // Curator-written text, shown in its own block.
  curatorMessage?: string;
  reference: string;
}

// Builds matching plain-text and HTML bodies. Every value is escaped, since
// names and messages come from visitors and curators.
export function buildVisitorEmail(content: VisitorEmailContent): OutgoingEmail {
  const details = content.details ?? [];
  const text = [
    `Hello ${content.visitorName},`,
    ...content.paragraphs,
    ...(details.length
      ? [details.map(([label, value]) => `${label}: ${value}`).join('\n')]
      : []),
    ...(content.curatorMessage
      ? [`Message from the museum:\n${content.curatorMessage}`]
      : []),
    `Reference number: ${content.reference}`,
    'Please include your reference number if you contact us about this.',
    'BioSphere Museum',
  ].join('\n\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f6f3;font-family:Arial,Helvetica,sans-serif;color:#1f2a24">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
<p style="margin:0 0 16px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#2f6b4f;font-weight:bold">BioSphere Museum</p>
<p style="margin:0 0 16px">Hello ${escapeHtml(content.visitorName)},</p>
${content.paragraphs
  .map((p) => `<p style="margin:0 0 16px;line-height:1.5">${escapeHtml(p)}</p>`)
  .join('\n')}
${
  details.length
    ? `<table style="border-collapse:collapse;margin:0 0 16px;font-size:14px">${details
        .map(
          ([label, value]) =>
            `<tr><td style="padding:4px 16px 4px 0;color:#5b6b62">${escapeHtml(label)}</td><td style="padding:4px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`,
        )
        .join('')}</table>`
    : ''
}
${
  content.curatorMessage
    ? `<div style="margin:0 0 16px;padding:12px 16px;background:#eef5f0;border-left:3px solid #2f6b4f;border-radius:4px"><p style="margin:0 0 6px;font-size:12px;color:#5b6b62">Message from the museum</p><p style="margin:0;white-space:pre-line;line-height:1.5">${escapeHtml(content.curatorMessage)}</p></div>`
    : ''
}
<p style="margin:0 0 4px;font-size:14px">Reference number: <strong style="font-family:monospace">${escapeHtml(content.reference)}</strong></p>
<p style="margin:0;font-size:12px;color:#5b6b62">Please include your reference number if you contact us about this.</p>
</div></body></html>`;

  return {
    to: content.to,
    toName: content.visitorName,
    subject: content.subject,
    text,
    html,
  };
}

// "2026-10-14" -> "Wednesday, October 14, 2026"
export function formatLongDate(isoDate: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00.000Z`));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
