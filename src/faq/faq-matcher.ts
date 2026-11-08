/**
 * Deterministic rule-based matcher for the public FAQ Assistant (REQ-4.11-04,
 * REQ-4.11-06, BR-18). It only ranks curator-approved entries handed to it; it
 * never generates text, so an answer can only ever be stored curator wording.
 *
 * Matching rules (proposed by the development team; pending team/client
 * approval, see docs/FAQ_KNOWLEDGE_GUIDE.md):
 * 1. Text is lowercased, accent-stripped, and reduced to alphanumeric tokens;
 *    a light plural stem is applied, and common English stopwords plus
 *    domain-generic words ("museum", "visitor"...) are dropped, since nearly
 *    every entry mentions them.
 * 2. A normalized visitor question equal to an entry's question or one of its
 *    alternative wordings is an exact match (score 1).
 * 3. Otherwise each phrase scores by Dice token overlap, the best phrase wins,
 *    and each curator keyword found in the question adds a fixed bonus.
 * 4. A non-exact match is answered only when it scores at or above
 *    ANSWER_THRESHOLD and at least MIN_EVIDENCE_TOKENS of the question's tokens
 *    (or all of them, for a one-token question) appear in the entry's approved
 *    vocabulary: question, alternative wording, and keywords.
 * 5. A unique highest eligible score wins. Equal strongest eligible scores
 *    require clarification with up to three approved question choices.
 *    Otherwise other RELATED_THRESHOLD entries are related questions.
 * Otherwise the caller falls back to General Inquiry.
 */

export const FAQ_MATCHING_RULES = {
  ANSWER_THRESHOLD: 0.6,
  MIN_EVIDENCE_TOKENS: 2,
  RELATED_THRESHOLD: 0.3,
  KEYWORD_BONUS: 0.15,
  MAX_KEYWORD_HITS: 3,
  MAX_RELATED: 3,
} as const;

const STOPWORDS = new Set([
  'a',
  'about',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'could',
  'do',
  'does',
  'for',
  'from',
  'get',
  'have',
  'how',
  'i',
  'if',
  'in',
  'is',
  'it',
  'me',
  'my',
  'of',
  'on',
  'or',
  'our',
  'please',
  'should',
  'so',
  'tell',
  'that',
  'the',
  'there',
  'their',
  'this',
  'to',
  'us',
  'was',
  'we',
  'what',
  'when',
  'where',
  'which',
  'who',
  'why',
  'will',
  'with',
  'would',
  'you',
  'your',
]);

// Words that appear in nearly every museum FAQ and so carry no matching signal.
const DOMAIN_STOPWORDS = new Set([
  'biological',
  'biosphere',
  'carlo',
  'museum',
  'san',
  'university',
  'usc',
  'visitor',
]);

// Limited to the SRS 4.11.2 transaction verbs plus booking verbs; broader verbs
// such as "change" or "schedule" also appear in ordinary questions.
const VISIT_TRANSACTION_TERMS = new Set([
  'submit',
  'approve',
  'cancel',
  'modify',
  'book',
  'reschedule',
]);

// Transactions on a request the visitor already sent. These go to a General
// Inquiry with the reference number, not to a new Visit Request.
const VISIT_CHANGE_TERMS = new Set(['cancel', 'modify', 'reschedule']);

const VISIT_SUBJECT_TERMS = new Set([
  'visit',
  'request',
  'appointment',
  'booking',
  'reservation',
  'tour',
  'trip',
]);

export interface FaqMatchCandidate {
  id: string;
  question: string;
  alternativeWording: string[];
  keywords: string[];
}

export interface FaqMatchResult<T extends FaqMatchCandidate> {
  best: { entry: T; score: number } | null;
  related: Array<{ entry: T; score: number }>;
  ambiguous?: true;
}

// Explicit English follow-up openers only. "And" counts only before a
// stopword preposition ("And on Saturday?"), so a complete new question such
// as "And how much is the fee?" stays a standalone question.
const FOLLOWUP_PATTERN =
  /^(?:(?:how|what) about|and(?= (?:on|for|at|in|with|if) ))(?: (.*))?$/;

/**
 * Returns the follow-up qualifier ("" when absent) for a recognized follow-up
 * opener, otherwise null. The public widget mirrors this pattern to decide when
 * to send its single topic hint; keep both in sync.
 */
export function parseFaqFollowup(question: string): string | null {
  const match = FOLLOWUP_PATTERN.exec(normalizeFaqText(question));
  return match ? (match[1] ?? '') : null;
}

export function normalizeFaqText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stem(token: string): string {
  if (token.length > 4 && token.endsWith('ies'))
    return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

export function tokenizeFaqText(text: string): string[] {
  const normalized = normalizeFaqText(text);
  if (!normalized) return [];
  return [
    ...new Set(
      normalized
        .split(' ')
        .filter((token) => !STOPWORDS.has(token))
        .map(stem)
        .filter((token) => !DOMAIN_STOPWORDS.has(token)),
    ),
  ];
}

function dice(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const rightSet = new Set(right);
  const shared = left.filter((token) => rightSet.has(token)).length;
  return (2 * shared) / (left.length + right.length);
}

function keywordHits(normalizedQuery: string, keywords: string[]): number {
  const padded = ` ${normalizedQuery} `;
  const stemmedQuery = ` ${normalizedQuery.split(' ').map(stem).join(' ')} `;
  let hits = 0;
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeFaqText(keyword);
    if (!normalizedKeyword) continue;
    const stemmedKeyword = normalizedKeyword.split(' ').map(stem).join(' ');
    if (
      padded.includes(` ${normalizedKeyword} `) ||
      stemmedQuery.includes(` ${stemmedKeyword} `)
    ) {
      hits += 1;
    }
  }
  return Math.min(hits, FAQ_MATCHING_RULES.MAX_KEYWORD_HITS);
}

export function scoreFaqCandidate(
  query: string,
  candidate: FaqMatchCandidate,
): number {
  const normalizedQuery = normalizeFaqText(query);
  if (!normalizedQuery) return 0;

  const phrases = [candidate.question, ...candidate.alternativeWording];
  if (phrases.some((phrase) => normalizeFaqText(phrase) === normalizedQuery)) {
    return 1;
  }

  const queryTokens = tokenizeFaqText(query);
  if (queryTokens.length === 0) return 0;

  const phraseScore = Math.max(
    ...phrases.map((phrase) => dice(queryTokens, tokenizeFaqText(phrase))),
  );
  const bonus =
    keywordHits(normalizedQuery, candidate.keywords) *
    FAQ_MATCHING_RULES.KEYWORD_BONUS;
  // An exact phrase is the only way to reach 1, so fuzzy scores stay below it.
  return Math.min(0.99, phraseScore + bonus);
}

/**
 * True when enough of the visitor's tokens appear in the entry's approved
 * vocabulary. Stops a single shared word from answering an unrelated question.
 */
export function hasMatchEvidence(
  query: string,
  candidate: FaqMatchCandidate,
): boolean {
  const queryTokens = tokenizeFaqText(query);
  if (queryTokens.length === 0) return false;
  const vocabulary = new Set(
    [
      candidate.question,
      ...candidate.alternativeWording,
      ...candidate.keywords,
    ].flatMap((phrase) => tokenizeFaqText(phrase)),
  );
  const matched = queryTokens.filter((token) => vocabulary.has(token)).length;
  return (
    matched >=
    Math.min(FAQ_MATCHING_RULES.MIN_EVIDENCE_TOKENS, queryTokens.length)
  );
}

function isAnswerable(
  query: string,
  { entry, score }: { entry: FaqMatchCandidate; score: number },
): boolean {
  if (score === 1) return true;
  return (
    score >= FAQ_MATCHING_RULES.ANSWER_THRESHOLD &&
    hasMatchEvidence(query, entry)
  );
}

/** Preserve direction: "X includes Y" and "Y included in X" share roles. */
function inclusionScope(normalized: string) {
  const match =
    /^(.*?)\b(included in|covered by|includes?|covers?)\b(.*)$/.exec(
      normalized,
    );
  if (!match) return null;
  const passive = match[2] === 'included in' || match[2] === 'covered by';
  return {
    source: tokenizeFaqText(passive ? match[3] : match[1]),
    target: tokenizeFaqText(passive ? match[1] : match[3]),
  };
}

/** Bounded English scope checks, not a general intent/negation interpreter. */
function hasApprovedScope(
  query: string,
  candidate: FaqMatchCandidate,
): boolean {
  const normalizedQuery = normalizeFaqText(query);
  const phrases = [candidate.question, ...candidate.alternativeWording];
  if (phrases.some((phrase) => normalizeFaqText(phrase) === normalizedQuery)) {
    return true;
  }
  if (
    /\b(?:not asking (?:about|for)|not interested in|(?:do not|don t|did not|didn t) mean)\b/.test(
      normalizedQuery,
    )
  ) {
    return false;
  }
  const requested = inclusionScope(normalizedQuery);
  if (!requested) return true;
  if (!requested.source.length || !requested.target.length) return false;

  // Keywords are ranking hints, not evidence of an approved relationship.
  // Require both roles in ONE question/alias, never assemble scope across aliases.
  return phrases.some((phrase) => {
    const approved = inclusionScope(normalizeFaqText(phrase));
    return (
      approved !== null &&
      requested.source.every((token) => approved.source.includes(token)) &&
      requested.target.every((token) => approved.target.includes(token))
    );
  });
}

export function matchFaqEntries<T extends FaqMatchCandidate>(
  query: string,
  candidates: T[],
): FaqMatchResult<T> {
  const ranked = candidates
    .filter((entry) => hasApprovedScope(query, entry))
    .map((entry) => ({ entry, score: scoreFaqCandidate(query, entry) }))
    .filter(({ score }) => score >= FAQ_MATCHING_RULES.RELATED_THRESHOLD)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.question.localeCompare(right.entry.question) ||
        left.entry.id.localeCompare(right.entry.id),
    );

  const best = ranked.find((candidate) => isAnswerable(query, candidate));
  if (best) {
    const tied = ranked.filter(
      (candidate) =>
        candidate.score === best.score && isAnswerable(query, candidate),
    );
    if (tied.length > 1) {
      // Equal strongest eligible scores cannot establish visitor intent.
      // Near-tie margins require separate evaluation; do not invent one here.
      return {
        best: null,
        related: tied.slice(0, FAQ_MATCHING_RULES.MAX_RELATED),
        ambiguous: true,
      };
    }
  }
  return {
    best: best ?? null,
    related: ranked
      .filter((candidate) => candidate !== best)
      .slice(0, FAQ_MATCHING_RULES.MAX_RELATED),
  };
}

/**
 * Detects a request to perform a Visit Request transaction (submit, approve,
 * cancel, modify...). The assistant never performs it; the caller only uses
 * this to point the visitor at the Visit Request form (SRS 4.11.2).
 */
export function isVisitRequestTransaction(query: string): boolean {
  const tokens = normalizeFaqText(query).split(' ').map(stem);
  return (
    tokens.some((token) => VISIT_TRANSACTION_TERMS.has(token)) &&
    tokens.some((token) => VISIT_SUBJECT_TERMS.has(token))
  );
}

// A visit-request transaction that changes or cancels an existing request.
export function isVisitRequestChange(query: string): boolean {
  const tokens = normalizeFaqText(query).split(' ').map(stem);
  return (
    isVisitRequestTransaction(query) &&
    tokens.some((token) => VISIT_CHANGE_TERMS.has(token))
  );
}
