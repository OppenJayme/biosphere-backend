import { ReplyRow, unansweredReplies } from './visitor-reply-alerts';

const VISIT = '5b2c0e7d-3333-4333-8333-333333333333';
const INQUIRY = '6c3d1f8e-4444-4444-8444-444444444444';
const at = (minute: number) => new Date(Date.UTC(2026, 10, 14, 3, minute));

const reply: ReplyRow = {
  id: 'reply-1',
  inquiry_id: null,
  visit_request_id: VISIT,
  created_at: at(10),
};

// These rows stand for what the follow-up query returns: entries with a
// curator (recorded_by not null). Receipts and BioSphere's pointer notes
// have no curator, so the query never returns them.
const curatorEntry = (
  minute: number,
  target = { visit_request_id: VISIT },
) => ({
  inquiry_id: null,
  visit_request_id: null,
  ...target,
  created_at: at(minute),
});

describe('unansweredReplies', () => {
  it('keeps a reply with no curator follow-up', () => {
    expect(unansweredReplies([reply], [])).toEqual([reply]);
  });

  it.each([['a curator email'], ['an internal note'], ['a status change']])(
    'clears a reply once %s is recorded after it',
    () => {
      expect(unansweredReplies([reply], [curatorEntry(20)])).toEqual([]);
    },
  );

  it('is not cleared by curator activity before the reply', () => {
    expect(unansweredReplies([reply], [curatorEntry(5)])).toEqual([reply]);
  });

  it('is not cleared by curator activity on another record', () => {
    expect(
      unansweredReplies(
        [reply],
        [curatorEntry(20, { visit_request_id: 'other-visit' })],
      ),
    ).toEqual([reply]);
    expect(
      unansweredReplies(
        [reply],
        [curatorEntry(20, { inquiry_id: INQUIRY } as never)],
      ),
    ).toEqual([reply]);
  });

  it('is not cleared by an automatic entry: the query passes none', () => {
    // A receipt or pointer note recorded after the reply is filtered out by
    // the recorded_by condition, so an empty follow-up list keeps the alert.
    expect(unansweredReplies([reply], [])).toEqual([reply]);
  });

  it('handles inquiry replies the same way', () => {
    const inquiryReply = {
      ...reply,
      inquiry_id: INQUIRY,
      visit_request_id: null,
    };
    expect(
      unansweredReplies(
        [inquiryReply],
        [{ inquiry_id: INQUIRY, visit_request_id: null, created_at: at(30) }],
      ),
    ).toEqual([]);
  });
});
