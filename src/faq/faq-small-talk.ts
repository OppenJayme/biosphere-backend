import { normalizeFaqText } from './faq-matcher';

/**
 * Fixed replies for conversational openers that carry no museum question.
 * These are product wording, not museum facts, so they never state hours,
 * fees, policies or anything else that must come from curator knowledge.
 */
export type FaqSmallTalkKind = 'GREETING' | 'THANKS' | 'GOODBYE' | 'HELP';

export const FAQ_SMALL_TALK_REPLIES: Record<FaqSmallTalkKind, string> = {
  GREETING:
    'Hello! I can help with visiting the USC Biological Museum: location, admission, appointments, group visits and museum rules. What would you like to know?',
  THANKS: "You're welcome! Ask me anything else about visiting the museum.",
  GOODBYE: 'Thank you for visiting. Have a great day!',
  HELP: 'I answer questions about visiting the museum using curator-approved information. Try asking where the museum is, how much admission costs, or how a group can request a visit.',
};

// English, Filipino and Cebuano openers seen on the public site. Only a
// leading greeting is recognized, so "hi where is the museum" still asks.
const GREETING =
  '(?:hi|hello|hey|hiya|good (?:morning|afternoon|evening|day)|kumusta|kamusta|maayong (?:buntag|udto|hapon|gabii)|magandang (?:umaga|hapon|gabi))';
const POLITE_TAIL = '(?: (?:there|po|museum|assistant|bot))*';

const PATTERNS: Array<[FaqSmallTalkKind, RegExp]> = [
  ['GREETING', new RegExp(`^${GREETING}${POLITE_TAIL}$`)],
  [
    'THANKS',
    /^(?:ok(?:ay)? )?(?:thanks?|thank you|thank u|ty|salamat|daghang salamat)(?: (?:so much|a lot|po|kaayo))*$/,
  ],
  [
    'GOODBYE',
    /^(?:bye|goodbye|good bye|see you|see ya|paalam|babay)(?: (?:po|later|na))*$/,
  ],
  [
    'HELP',
    /^(?:help|what can you do|who are you|what are you|how does this work|what do you know)$/,
  ],
];

const LEADING_GREETING = new RegExp(`^${GREETING}${POLITE_TAIL} `);

/** Recognizes a message that is only a greeting, thanks, goodbye or help request. */
export function detectFaqSmallTalk(question: string): FaqSmallTalkKind | null {
  const normalized = normalizeFaqText(question);
  if (!normalized) return null;
  for (const [kind, pattern] of PATTERNS) {
    if (pattern.test(normalized)) return kind;
  }
  return null;
}

/**
 * Removes a leading greeting ("Hello, where is the museum?") so the question
 * itself is matched. Returns the original text when nothing would remain.
 */
export function stripLeadingGreeting(question: string): string {
  const normalized = normalizeFaqText(question);
  const match = LEADING_GREETING.exec(normalized);
  if (!match) return question;
  const rest = normalized.slice(match[0].length).trim();
  return rest || question;
}
