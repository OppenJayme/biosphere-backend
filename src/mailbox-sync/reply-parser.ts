// Pure helpers that turn a Gmail API message into the parts the mailbox
// sync needs. Nothing here touches the network or the database.

// Longest reply text stored in the timeline; the full email stays in Gmail.
export const MAX_REPLY_LENGTH = 10_000;

// "(Ref 9A81836F)" as written in every BioSphere visitor email subject.
const SUBJECT_REFERENCE = /\bRef\s+([0-9a-f]{8})\b/i;
const MESSAGE_ID = /<[^<>\s]+>/g;
// Postgres text rejects NUL, and other control characters only garble the
// timeline; tabs and newlines stay.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export interface GmailMessagePart {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

export interface ParsedReply {
  gmailId: string;
  messageId: string;
  inReplyTo: string[];
  from: string | null;
  subject: string;
  reference: string | null;
  receivedAt: Date;
  automated: boolean;
  // Gmail's own SPF/DKIM/DMARC result says the From domain really sent it.
  authenticated: boolean;
  text: string;
}

export function parseGmailMessage(message: GmailMessage): ParsedReply {
  const header = (name: string) =>
    message.payload?.headers?.find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    )?.value ?? '';
  const subject = stripControlCharacters(header('Subject')).trim();
  const from = senderAddress(header('From'));
  const autoSubmitted = header('Auto-Submitted').trim().toLowerCase();
  const precedence = header('Precedence').trim().toLowerCase();

  return {
    gmailId: message.id,
    // A Message-ID is required by RFC 5322 but not guaranteed; the Gmail id
    // still dedupes it.
    messageId: (header('Message-ID') || `<gmail-${message.id}>`).slice(0, 255),
    inReplyTo: [
      ...new Set([
        ...(header('In-Reply-To').match(MESSAGE_ID) ?? []),
        ...(header('References').match(MESSAGE_ID) ?? []),
      ]),
    ],
    from,
    subject,
    reference: SUBJECT_REFERENCE.exec(subject)?.[1]?.toUpperCase() ?? null,
    receivedAt: new Date(Number(message.internalDate ?? Date.now())),
    // Out-of-office and mailing-list mail must not land in a timeline.
    automated:
      (autoSubmitted !== '' && autoSubmitted !== 'no') ||
      ['auto_reply', 'bulk', 'junk', 'list'].includes(precedence),
    authenticated: isAuthenticatedSender(
      header('Authentication-Results'),
      from,
    ),
    text: replyText(message.payload),
  };
}

// The From header is easy to forge, so a reply is trusted only when the
// receiving server (Gmail, which writes the topmost Authentication-Results
// header and the one `header()` returns first) says the From domain passed
// DMARC, Gmail's best guess DMARC for domains without a record, or DKIM
// signed by that same domain. Anything else stays in the mailbox only.
export function isAuthenticatedSender(
  results: string,
  from: string | null,
): boolean {
  const domain = from?.split('@')[1];
  if (!results || !domain) return false;
  const verdicts = results.toLowerCase();
  if (/\bdmarc=fail\b/.test(verdicts)) return false;
  if (/\bdmarc=(pass|bestguesspass)\b/.test(verdicts)) return true;
  return [
    ...verdicts.matchAll(/\bdkim=pass\b[^;]*?header\.(?:i|d)=@?([^\s;]+)/g),
  ]
    .map((match) => match[1].replace(/^.*@/, ''))
    .some((signer) => signer === domain || signer.endsWith(`.${domain}`));
}

export function stripControlCharacters(value: string): string {
  return value.replace(CONTROL_CHARACTERS, '');
}

// "Maria Santos <Maria@Example.com>" -> "maria@example.com".
export function senderAddress(from: string): string | null {
  const bracketed = /<([^<>\s]+@[^<>\s]+)>/.exec(from)?.[1];
  const bare = /([^\s<>"]+@[^\s<>"]+)/.exec(from)?.[1];
  const address = bracketed ?? bare;
  return address ? address.toLowerCase() : null;
}

// The visitor's own words: the plain-text part (or tag-stripped HTML) with
// the quoted earlier message removed and the length capped.
export function replyText(payload: GmailMessagePart | undefined): string {
  const plain = findPart(payload, 'text/plain');
  const html = plain ? undefined : findPart(payload, 'text/html');
  const raw = plain
    ? decodeBody(plain)
    : html
      ? htmlToText(decodeBody(html))
      : '';
  const normalized = stripControlCharacters(raw.replace(/\r\n?/g, '\n'));
  const stripped = stripQuotedReply(normalized).trim();
  const text = stripped || normalized.trim();
  return text.length > MAX_REPLY_LENGTH
    ? `${text.slice(0, MAX_REPLY_LENGTH)}\n\n[Reply shortened; see the museum mailbox for the full email.]`
    : text;
}

// Removes the quoted earlier email. Everything from the first quote header
// on is cut: Gmail's "On <date>, <name> wrote:" (sometimes wrapped over two
// lines), Outlook's "From: ... / Sent: ..." block, or
// "-----Original Message-----". Lines starting with ">" are dropped wherever
// they are, so an inline reply ("> question" then the answer) keeps the
// visitor's answers.
export function stripQuotedReply(text: string): string {
  const lines = text.split('\n');
  let end = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const next = (lines[index + 1] ?? '').trim();
    const startsQuote =
      /^-{2,}\s*Original Message\s*-{2,}$/i.test(line) ||
      (/^On\b/.test(line) && /wrote:$/.test(line)) ||
      (/^On\b/.test(line) && /wrote:$/.test(`${line} ${next}`)) ||
      (/^From:\s/i.test(line) && /^(Sent|Date):\s/i.test(next));
    if (startsQuote) {
      end = index;
      break;
    }
  }
  return lines
    .slice(0, end)
    .filter((line) => !line.trim().startsWith('>'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

function findPart(
  part: GmailMessagePart | undefined,
  mimeType: string,
): GmailMessagePart | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && !part.filename && part.body?.data) {
    return part;
  }
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) return found;
  }
  return undefined;
}

function decodeBody(part: GmailMessagePart): string {
  return Buffer.from(part.body?.data ?? '', 'base64url').toString('utf8');
}

function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<blockquote[\s\S]*$/i, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n');
}
