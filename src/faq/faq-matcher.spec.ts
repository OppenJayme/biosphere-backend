import {
  FAQ_MATCHING_RULES,
  isVisitRequestTransaction,
  matchFaqEntries,
  normalizeFaqText,
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
      ambiguous: [],
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
});
