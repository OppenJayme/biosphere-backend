import {
  isAuthenticatedSender,
  MAX_REPLY_LENGTH,
  parseGmailMessage,
  senderAddress,
  stripQuotedReply,
} from './reply-parser';

const encode = (text: string) =>
  Buffer.from(text, 'utf8').toString('base64url');

const message = (
  headers: Record<string, string>,
  parts: { mimeType: string; text: string; filename?: string }[],
) => ({
  id: 'gmail-1',
  internalDate: String(Date.parse('2026-11-11T02:00:00.000Z')),
  payload: {
    mimeType: 'multipart/alternative',
    headers: Object.entries(headers).map(([name, value]) => ({ name, value })),
    parts: parts.map((part) => ({
      mimeType: part.mimeType,
      filename: part.filename ?? '',
      body: { data: encode(part.text) },
    })),
  },
});

describe('reply parser', () => {
  it('reads headers, reference code, and the plain-text reply', () => {
    const parsed = parseGmailMessage(
      message(
        {
          From: 'Maria Santos <Maria@Example.com>',
          Subject: 'Re: Update on your BioSphere visit request (Ref 9a81836f)',
          'Message-ID': '<reply-1@mail.gmail.com>',
          'In-Reply-To': '<sent-1@smtp-relay.mailin.fr>',
          References: '<receipt@x> <sent-1@smtp-relay.mailin.fr>',
          'Authentication-Results':
            'mx.google.com; dkim=pass header.i=@example.com; dmarc=pass',
        },
        [
          {
            mimeType: 'text/plain',
            text: 'We can come at 1 PM instead.\r\n\r\nOn Tue, Nov 11, 2026 at 9:00 AM USC Biological Museum <museum@example.com> wrote:\r\n> Original text',
          },
          { mimeType: 'text/html', text: '<p>ignored</p>' },
        ],
      ),
    );

    expect(parsed).toEqual({
      gmailId: 'gmail-1',
      messageId: '<reply-1@mail.gmail.com>',
      inReplyTo: ['<sent-1@smtp-relay.mailin.fr>', '<receipt@x>'],
      from: 'maria@example.com',
      subject: 'Re: Update on your BioSphere visit request (Ref 9a81836f)',
      reference: '9A81836F',
      receivedAt: new Date('2026-11-11T02:00:00.000Z'),
      automated: false,
      authenticated: true,
      text: 'We can come at 1 PM instead.',
    });
  });

  it('falls back to tag-stripped HTML and drops the quoted blockquote', () => {
    const parsed = parseGmailMessage(
      message({ From: 'a@b.co', Subject: 'Hi' }, [
        {
          mimeType: 'text/html',
          text: '<div>Yes, 20 students &amp; 2 teachers.<br>Thanks</div><blockquote>old</blockquote>',
        },
      ]),
    );
    expect(parsed.text).toBe('Yes, 20 students & 2 teachers.\nThanks');
    expect(parsed.reference).toBeNull();
  });

  it('ignores attachments when looking for the text part', () => {
    const parsed = parseGmailMessage(
      message({ From: 'a@b.co' }, [
        { mimeType: 'text/plain', text: 'attachment', filename: 'list.txt' },
        { mimeType: 'text/plain', text: 'Body' },
      ]),
    );
    expect(parsed.text).toBe('Body');
  });

  it.each([
    [{ 'Auto-Submitted': 'auto-replied' }, true],
    [{ 'Auto-Submitted': 'no' }, false],
    [{ Precedence: 'bulk' }, true],
    [{}, false],
  ])('flags automated mail %p as %p', (headers, automated) => {
    const parsed = parseGmailMessage(
      message({ From: 'a@b.co', ...headers }, [
        { mimeType: 'text/plain', text: 'Out of office' },
      ]),
    );
    expect(parsed.automated).toBe(automated);
  });

  it('removes NUL and other control characters but keeps line breaks', () => {
    const parsed = parseGmailMessage(
      message({ From: 'a@b.co', Subject: 'Re:\u0000 visit' }, [
        { mimeType: 'text/plain', text: 'Line one\u0000\u0007\nLine\ttwo' },
      ]),
    );
    expect(parsed.subject).toBe('Re: visit');
    expect(parsed.text).toBe('Line one\nLine\ttwo');
  });

  it('uses the Gmail id when the Message-ID header is missing', () => {
    const parsed = parseGmailMessage(
      message({ From: 'a@b.co' }, [{ mimeType: 'text/plain', text: 'x' }]),
    );
    expect(parsed.messageId).toBe('<gmail-gmail-1>');
  });

  it('shortens very long replies', () => {
    const parsed = parseGmailMessage(
      message({ From: 'a@b.co' }, [
        { mimeType: 'text/plain', text: 'a'.repeat(MAX_REPLY_LENGTH + 5) },
      ]),
    );
    expect(parsed.text.startsWith('a'.repeat(MAX_REPLY_LENGTH))).toBe(true);
    expect(parsed.text).toContain('Reply shortened');
  });

  describe('stripQuotedReply', () => {
    it.each([
      ['Gmail on one line', 'Yes\n\nOn Mon, X <a@b> wrote:\nold'],
      [
        'Gmail wrapped',
        'Yes\n\nOn Mon, Nov 10, 2026 at 9:00 AM X <a@b>\nwrote:\nold',
      ],
      ['Outlook header', 'Yes\n\nFrom: Museum\nSent: Monday\nold'],
      ['Original Message', 'Yes\n\n-----Original Message-----\nold'],
      ['> quote', 'Yes\n\n> old'],
    ])('cuts at a %s', (_label, text) => {
      expect(stripQuotedReply(text).trim()).toBe('Yes');
    });

    it('keeps the answers in an inline reply', () => {
      const text =
        'Here you go.\n\n> How many students?\n32 students\n\n> Any vehicles?\nOne bus\n\nOn Mon, X <a@b> wrote:\n> old';
      expect(stripQuotedReply(text)).toBe(
        'Here you go.\n\n32 students\n\nOne bus\n',
      );
    });

    it('keeps a reply that merely mentions "From:" mid-text', () => {
      const text = 'From: our school we will bring 20.\nThanks';
      expect(stripQuotedReply(text)).toBe(text);
    });
  });

  describe('isAuthenticatedSender', () => {
    it.each([
      [
        'DMARC pass',
        'mx.google.com; dmarc=pass header.from=school.edu.ph',
        true,
      ],
      [
        'Gmail best guess for a domain with no DMARC record',
        'mx.google.com; spf=pass; dmarc=bestguesspass header.from=school.edu.ph',
        true,
      ],
      [
        'DKIM signed by the same domain',
        'mx.google.com; dkim=pass header.i=@school.edu.ph header.s=x',
        true,
      ],
      [
        'DKIM signed by a subdomain',
        'mx.google.com; dkim=pass header.d=mail.school.edu.ph',
        true,
      ],
      [
        'DMARC fail despite DKIM',
        'mx.google.com; dkim=pass header.i=@school.edu.ph; dmarc=fail',
        false,
      ],
      [
        'DKIM from another domain',
        'mx.google.com; dkim=pass header.i=@evil.test',
        false,
      ],
      [
        'SPF pass alone',
        'mx.google.com; spf=pass smtp.mailfrom=school.edu.ph',
        false,
      ],
      ['no results', '', false],
    ])('%s', (_label, results, expected) => {
      expect(isAuthenticatedSender(results, 'maria@school.edu.ph')).toBe(
        expected,
      );
    });

    it('rejects a lookalike domain that only ends with the same letters', () => {
      expect(
        isAuthenticatedSender(
          'mx.google.com; dkim=pass header.d=notschool.edu.ph',
          'maria@school.edu.ph',
        ),
      ).toBe(false);
    });
  });

  it.each([
    ['"Santos, Maria" <maria@example.com>', 'maria@example.com'],
    ['MARIA@EXAMPLE.COM', 'maria@example.com'],
    ['Undisclosed recipients', null],
  ])('reads sender %p', (from, expected) => {
    expect(senderAddress(from)).toBe(expected);
  });
});
