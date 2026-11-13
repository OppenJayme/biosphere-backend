import { nextDeliveryResult, parseBrevoEvents } from './brevo-event';

const ID = '<202611131903.56557643399@smtp-relay.mailin.fr>';
const event = (name: string, reason?: string) =>
  parseBrevoEvents({ event: name, 'message-id': ID, reason })[0];

describe('parseBrevoEvents', () => {
  it('reads a single event and a batched array', () => {
    expect(parseBrevoEvents({ event: 'delivered', 'message-id': ID })).toEqual([
      { messageId: ID, event: 'delivered', outcome: 'delivered', reason: null },
    ]);
    expect(
      parseBrevoEvents([
        { event: 'hard_bounce', 'message-id': ID, reason: 'No such user' },
        { event: 'opened', 'message-id': ID },
      ]).map((item) => item.outcome),
    ).toEqual(['failed', 'delivered']);
  });

  it('ignores events that cannot change a timeline entry', () => {
    expect(
      parseBrevoEvents([
        { event: 'request', 'message-id': ID },
        { event: 'unsubscribed', 'message-id': ID },
        { event: 'delivered' },
        { event: 'delivered', 'message-id': 'x'.repeat(256) },
        'not an object',
        null,
      ]),
    ).toEqual([]);
    expect(parseBrevoEvents(undefined)).toEqual([]);
  });
});

describe('nextDeliveryResult', () => {
  const accepted = `SENT ${ID}`;

  it('marks an accepted email delivered and keeps the SENT prefix', () => {
    expect(nextDeliveryResult(accepted, event('delivered'))).toBe(
      `SENT ${ID} · delivered`,
    );
  });

  it('records a bounce after acceptance as FAILED with its reason', () => {
    expect(
      nextDeliveryResult(accepted, event('hard_bounce', 'Mailbox not found')),
    ).toBe('FAILED hard_bounce: Mailbox not found');
  });

  it('records a delay, then lets delivery or a newer delay replace it', () => {
    const delayed = nextDeliveryResult(accepted, event('deferred', 'Quota'))!;
    expect(delayed).toBe(`SENT ${ID} · delayed (deferred): Quota`);
    expect(nextDeliveryResult(delayed, event('soft_bounce', 'Full'))).toBe(
      `SENT ${ID} · delayed (soft_bounce): Full`,
    );
    expect(nextDeliveryResult(delayed, event('delivered'))).toBe(
      `SENT ${ID} · delivered`,
    );
  });

  it('never moves a final outcome backwards when events arrive late', () => {
    const delivered = `SENT ${ID} · delivered`;
    expect(nextDeliveryResult(delivered, event('deferred'))).toBeNull();
    expect(nextDeliveryResult(delivered, event('opened'))).toBeNull();
    expect(nextDeliveryResult('FAILED blocked', event('delivered'))).toBeNull();
  });

  it('stays within the 100-character column', () => {
    const result = nextDeliveryResult(
      accepted,
      event('soft_bounce', 'r'.repeat(300)),
    )!;
    expect(result.length).toBe(100);
    expect(result).toContain(' · delayed');
  });
});
