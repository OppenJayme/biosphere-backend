/**
 * Deterministic rule-based matcher for the public FAQ Assistant (REQ-4.11-04,
 * REQ-4.11-06, BR-18). It only ranks curator-approved entries handed to it; it
 * never generates text, so an answer can only ever be stored curator wording.
 *
 * Matching rules (approved for the MVP):
 * 1. Text is lowercased, accent-stripped, and reduced to alphanumeric tokens;
 *    common English stopwords are dropped and a light plural stem is applied.
 * 2. A normalized visitor question equal to an entry's question or one of its
 *    alternative wordings is an exact match (score 1).
 * 3. Otherwise each phrase scores by Dice token overlap, the best phrase wins,
 *    and each curator keyword found in the question adds a fixed bonus.
 * 4. Only the best entry at or above ANSWER_THRESHOLD is answered; other entries
 *    at or above RELATED_THRESHOLD are offered as related approved questions.
 * Below the threshold the caller falls back to General Inquiry.
 */

export const FAQ_MATCHING_RULES = {
  ANSWER_THRESHOLD: 0.5,
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

const VISIT_TRANSACTION_TERMS = new Set([
  'submit',
  'approve',
  'cancel',
  'modify',
  'change',
  'edit',
  'update',
  'reschedule',
  'book',
  'reserve',
  'schedule',
  'confirm',
  'register',
]);

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
        .map(stem),
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

export function matchFaqEntries<T extends FaqMatchCandidate>(
  query: string,
  candidates: T[],
): FaqMatchResult<T> {
  const ranked = candidates
    .map((entry) => ({ entry, score: scoreFaqCandidate(query, entry) }))
    .filter(({ score }) => score >= FAQ_MATCHING_RULES.RELATED_THRESHOLD)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entry.question.localeCompare(right.entry.question) ||
        left.entry.id.localeCompare(right.entry.id),
    );

  const top = ranked[0];
  if (!top || top.score < FAQ_MATCHING_RULES.ANSWER_THRESHOLD) {
    return {
      best: null,
      related: ranked.slice(0, FAQ_MATCHING_RULES.MAX_RELATED),
    };
  }
  return {
    best: top,
    related: ranked.slice(1, 1 + FAQ_MATCHING_RULES.MAX_RELATED),
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
