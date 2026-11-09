import {
  FAQ_MATCHING_RULES,
  isVisitRequestChange,
  isVisitRequestTransaction,
  matchFaqEntries,
  normalizeFaqText,
  parseFaqFollowup,
  retrieveFaqCandidates,
  scoreFaqCandidate,
  tokenizeFaqText,
} from './faq-matcher';

const hours = {
  id: 'a',
  question: 'When is the museum open?',
  alternativeWording: ['What are the opening hours?'],
  keywords: ['hours', 'schedule'],
};
const parking = {
  id: 'b',
  question: 'Is there parking for visitors?',
  alternativeWording: ['Where can I park my car?'],
  keywords: ['parking', 'vehicle'],
};
const fees = {
  id: 'c',
  question: 'Is there an entrance fee for the museum?',
  alternativeWording: ['How much is admission?'],
  keywords: ['fee', 'price', 'admission'],
};
const entries = [hours, parking, fees];

describe('faq-matcher', () => {
  it('normalizes case, accents, and punctuation', () => {
    expect(normalizeFaqText('  Café — OPEN?!  ')).toBe('cafe open');
    expect(tokenizeFaqText('What are the opening hours?')).toEqual([
      'opening',
      'hour',
    ]);
  });

  it('treats the stored question or alternative wording as an exact match', () => {
    expect(scoreFaqCandidate('when is the MUSEUM open', hours)).toBe(1);
    expect(scoreFaqCandidate('What are the opening hours', hours)).toBe(1);
  });

  it('answers paraphrases and keyword questions above the threshold', () => {
    const result = matchFaqEntries(
      'What are the museum opening hours today?',
      entries,
    );
    expect(result.best?.entry.id).toBe('a');
    expect(result.best?.score).toBeGreaterThanOrEqual(
      FAQ_MATCHING_RULES.ANSWER_THRESHOLD,
    );

    expect(matchFaqEntries('parking?', entries).best?.entry.id).toBe('b');
    expect(matchFaqEntries('admission price', entries).best?.entry.id).toBe(
      'c',
    );
  });

  it('falls back when nothing approved matches', () => {
    expect(matchFaqEntries('What species is this beetle?', entries).best).toBe(
      null,
    );
    expect(
      matchFaqEntries('Explain the theory of evolution', entries).best,
    ).toBe(null);
    expect(matchFaqEntries('what is the', entries)).toEqual({
      best: null,
      related: [],
    });
  });

  it('does not answer unrelated questions that only share the word "museum"', () => {
    // Reviewer reproduction: two entries without keywords or alternatives.
    const bare = [
      { ...hours, alternativeWording: [], keywords: [] },
      { ...fees, alternativeWording: [], keywords: [] },
    ];
    for (const question of [
      'Who founded the museum?',
      'What species are in the museum?',
      'Is the museum hiring?',
      'museum',
      'Is the museum open to hiring new positions?',
    ]) {
      expect(matchFaqEntries(question, bare).best).toBe(null);
      expect(matchFaqEntries(question, entries).best).toBe(null);
    }
  });

  it('only ranks the candidates it is given', () => {
    expect(matchFaqEntries('When is the museum open?', []).best).toBe(null);
  });

  it('returns other close entries as related questions, deterministically', () => {
    const result = matchFaqEntries('museum entrance fee hours', entries);
    expect(result.best?.entry.id).toBe('c');
    expect(result.related.map(({ entry }) => entry.id)).toContain('a');
    expect(matchFaqEntries('museum entrance fee hours', entries)).toEqual(
      result,
    );
  });

  it('detects visit-request transactions but not general visit questions', () => {
    expect(isVisitRequestTransaction('Please cancel my visit request')).toBe(
      true,
    );
    expect(isVisitRequestTransaction('Can you approve my tour booking?')).toBe(
      true,
    );
    expect(isVisitRequestTransaction('Book a visit for Friday')).toBe(true);
    expect(isVisitRequestTransaction('When is the museum open?')).toBe(false);
    expect(isVisitRequestTransaction('What should I bring on my visit?')).toBe(
      false,
    );
    expect(isVisitRequestTransaction('What is the visit schedule?')).toBe(
      false,
    );
    expect(isVisitRequestTransaction('Can I change the tour language?')).toBe(
      false,
    );
    expect(isVisitRequestTransaction('How do I register for a tour?')).toBe(
      false,
    );
  });

  it('separates changes to a sent request from new requests', () => {
    expect(isVisitRequestChange('Please cancel my visit request')).toBe(true);
    expect(isVisitRequestChange('Reschedule my museum visit')).toBe(true);
    expect(isVisitRequestChange('Book a visit for Friday')).toBe(false);
    expect(isVisitRequestChange('Approve my visit request')).toBe(false);
    expect(isVisitRequestChange('Cancel the newsletter')).toBe(false);
  });
});

describe('parseFaqFollowup', () => {
  it('returns the qualifier for explicit how/what-about openers', () => {
    expect(parseFaqFollowup('What about Saturday?')).toBe('saturday');
    expect(parseFaqFollowup('How about on weekends?')).toBe('on weekends');
    expect(parseFaqFollowup('How about?')).toBe('');
  });

  it('accepts "and" only before a preposition', () => {
    expect(parseFaqFollowup('And on Saturday?')).toBe('on saturday');
    expect(parseFaqFollowup('and for students')).toBe('for students');
    expect(parseFaqFollowup('And if we bring kids?')).toBe('if we bring kids');
  });

  it('leaves complete or unrelated questions to the standalone matcher', () => {
    expect(parseFaqFollowup('And how much is the entrance fee?')).toBeNull();
    expect(parseFaqFollowup('And?')).toBeNull();
    expect(parseFaqFollowup('Android app?')).toBeNull();
    expect(parseFaqFollowup('Tell me about the museum')).toBeNull();
    expect(parseFaqFollowup('What time does the museum open?')).toBeNull();
  });
});

describe('retrieveFaqCandidates', () => {
  const doc = (id: string, question: string) => ({
    id,
    question,
    answer: 'Approved answer.',
    alternativeWording: [] as string[],
    keywords: [] as string[],
  });
  const docs = [
    doc('loc', 'Where is the museum located?'),
    doc('fee', 'How much is admission?'),
    doc('photo', 'Are photographs and videos allowed at the museum?'),
    doc('touch', 'May I touch specimens or displays in the museum?'),
  ];

  it('ranks by rare words, keeping question words like "where"', () => {
    expect(retrieveFaqCandidates('Museum where', docs, 3)[0].entry.id).toBe(
      'loc',
    );
    expect(
      retrieveFaqCandidates('how much to get in', docs, 3)[0].entry.id,
    ).toBe('fee');
  });

  it('ignores words that most entries share and caps the result', () => {
    expect(retrieveFaqCandidates('museum', docs, 3)).toEqual([]);
    expect(retrieveFaqCandidates('', docs, 3)).toEqual([]);
    expect(
      retrieveFaqCandidates('where much photographs touch', docs, 2),
    ).toHaveLength(2);
  });
});

describe('isVisitRequestTransaction booking phrasing', () => {
  it('treats "book us" as a booking request but not a mention of books', () => {
    expect(isVisitRequestTransaction('Book us for tomorrow')).toBe(true);
    expect(isVisitRequestTransaction('Can you reserve a slot?')).toBe(true);
    expect(isVisitRequestTransaction('Do you sell books about birds?')).toBe(
      false,
    );
  });
});
