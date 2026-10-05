# BioSphere FAQ Knowledge Management Guide

This module implements the curator-controlled knowledge lifecycle required by
REQ-4.11-02, REQ-4.11-03, and REQ-4.11-09, plus the public assistant below, using the existing
`public.faq_entry` table. It does not change the database schema.

## Lifecycle and approval boundary

- New entries always start as `INACTIVE`. Status is not accepted by create or
  update DTOs, and requests that try to inject one are rejected.
- Curators may edit `ACTIVE` and `INACTIVE` knowledge.
- Activation is the explicit approval step that makes an entry eligible for
  the public assistant.
- Deactivation removes an entry from matching eligibility without destroying
  it.
- Archive is permanent through routine API operations. Archived entries remain
  readable for history but cannot be edited, activated, or deactivated.
- Repeating the current lifecycle command is idempotent and does not create a
  duplicate audit event.
- No hard-delete endpoint is exposed.

## Knowledge fields

- `question` and `answer` are required non-empty plain text.
- `alternativeWording` and `keywords` are optional curator-approved text lists.
  Values are trimmed, repeated whitespace is collapsed, and case-insensitive
  duplicates within a request are removed while preserving the first spelling.
- `category` is optional curator-extensible text limited to the existing
  PostgreSQL `VARCHAR(100)` boundary. It is not an enum.
- HTML is not interpreted by the backend. Frontends must render these fields as
  escaped text unless a separate reviewed rich-text policy is introduced.

## Endpoints

- `POST /faq/entries`
- `GET /faq/entries?status=INACTIVE&category=Visit&page=1&limit=25`
- `GET /faq/entries/:id`
- `PATCH /faq/entries/:id`
- `PATCH /faq/entries/:id/activate`
- `PATCH /faq/entries/:id/deactivate`
- `PATCH /faq/entries/:id/archive`

All endpoints in this slice require an authenticated, active `CURATOR` account.
Mutations store BioSphere `user_account.id` attribution and write a protected
audit event atomically in the same serializable Prisma transaction.

## Public FAQ Assistant

The public assistant (REQ-4.11-01, REQ-4.11-04 to REQ-4.11-07, REQ-4.11-10,
BR-18) is served by `FaqAssistantController` on `@Public()` routes, separate
from the curator controller so its class-level `@Roles('CURATOR')` cannot block
visitors. Both routes are throttled at 30 requests per minute per IP.

- `GET /faq/assistant/suggestions?limit=6` — suggested questions from `ACTIVE`
  entries only (`id`, `question`, `category`), oldest first, max 20.
- `POST /faq/assistant/ask` with `{ "question": "..." }` (1–500 chars). No other
  field is accepted, so no personal information is collected.

The assistant only reads `ACTIVE` entries. It never writes: the question is not
stored, and no audit row is created. Responses contain only stored curator text
and a narrow public projection (no status, attribution, keywords, or alternative
wording).

### Matching rules

Implemented in `src/faq/faq-matcher.ts`; thresholds live in
`FAQ_MATCHING_RULES`.

1. Text is lowercased, accent-stripped, reduced to alphanumeric tokens, common
   English stopwords are dropped, and a light plural stem is applied.
2. A normalized question equal to an entry's question or an alternative wording
   is an exact match (score 1).
3. Otherwise the best Dice token overlap across the question and alternative
   wordings is used, plus 0.15 per curator keyword found in the question (max 3).
4. The top entry is answered only at score ≥ 0.5. Up to three other entries at
   ≥ 0.3 are returned as related approved questions. Ties break on question text
   then id, so results are deterministic.

No AI, embeddings, or generated text are involved.

### Response outcomes

| `outcome`                | When                                                    | `redirect`        |
| ------------------------ | ------------------------------------------------------- | ----------------- |
| `ANSWERED`               | An active entry met the threshold                       | `null`, or `VISIT_REQUEST` if the visitor asked for a visit transaction |
| `NO_MATCH`               | Nothing met the threshold                               | `GENERAL_INQUIRY` |
| `VISIT_REQUEST_REDIRECT` | No match, and the visitor asked to submit, approve, cancel, or change a visit | `VISIT_REQUEST` |

Every response includes `notice`, the "limited to curator-approved museum
information" disclosure the widget must show (REQ-4.11-10). The frontend maps
`redirect` to its own General Inquiry or Visit Request route.

## Curator search

`GET /faq/entries?search=parking` matches question, answer, and category
case-insensitively, and an exact keyword. It combines with `status` and
`category`.
